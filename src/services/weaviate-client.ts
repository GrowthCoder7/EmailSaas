import weaviate, { type WeaviateClient, type WeaviateClass } from 'weaviate-ts-client';

export const weaviateClient: WeaviateClient = weaviate.client({
    scheme: 'http',
    host: 'localhost:8080', 
})

// Define Types for your Data
export interface EmailChunkProperties {
    content: string;
    emailId: string;
    subject: string;
}

export interface SearchResult {
    content: string;
    emailId: string;
    subject: string;
    similarity: number;
    score: number;
}

const EMAIL_CHUNK_SCHEMA: WeaviateClass = {
    class: 'EmailChunk',
    description: 'A semantic chunk of an email',
    vectorizer: 'none', // correct, since you provide your own vectors
    properties: [
        {
            name: 'content',
            dataType: ['text'], 
            description: 'The text content of the chunk',
        },
        {
            name: 'emailId',
            dataType: ['text'], 
            description: 'ID of the parent email',
            // indexFilterable: true, // Useful if you want to filter by emailId later
        },
        {
            name: 'subject',
            dataType: ['text'],
            description: 'Subject of the email',
        }
    ],
};

export class VectorDbService {

    /**
     * Initializes the Schema.
     * Idempotent: Checks if it exists first.
     */
    static async initSchema() {
        try {
            const schemaRes = await weaviateClient.schema.getter().do();
            const classExists = schemaRes.classes?.some((c) => c.class === 'EmailChunk');

            if (classExists) {
                console.log('✅ Weaviate schema (EmailChunk) already exists.');
                return;
            }

            console.log('🚧 Creating Weaviate schema for EmailChunk...');
            await weaviateClient.schema
                .classCreator()
                .withClass(EMAIL_CHUNK_SCHEMA)
                .do();
            
            console.log('✅ Schema created successfully!');

        } catch (error) {
            console.error('❌ Error initializing Weaviate schema:', error);
            throw error; // Rethrow so your app knows it failed to start
        }
    }

    static async saveChunks(chunks: string[], vectors: number[][], emailId: string, subject: string = "No Subject") {
        if (chunks.length !== vectors.length) {
            throw new Error("Mismatch: Number of chunks and vectors must be equal.");
        }

        const BATCH_SIZE = 100; 
        const totalChunks = chunks.length;

        console.log(`💾 Starting import of ${totalChunks} chunks...`);

        for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
            const batcher = weaviateClient.batch.objectsBatcher();
            const chunkSlice = chunks.slice(i, i + BATCH_SIZE);
            const vectorSlice = vectors.slice(i, i + BATCH_SIZE);

            // Add items to the batcher
            chunkSlice.forEach((chunk, idx) => {
                const vector = vectorSlice[idx];
                
                // Guard clause for bad data
                if (!chunk || !vector) return; 

                batcher.withObject({
                    class: 'EmailChunk',
                    properties: {
                        content: chunk,
                        emailId: emailId,
                        subject: subject
                    },
                    vector: vector,
                });
            });

            // Submit this batch
            try {
                const result = await batcher.do();
                
                // Check for errors specific to this batch
                const errors = result.filter(r => r.result?.errors);
                if (errors.length > 0) {
                    console.error(`❌ Error in batch ${i}-${i + BATCH_SIZE}:`, JSON.stringify(errors, null, 2));
                    // Optional: decide if you want to `break` or `continue` here
                } else {
                    console.log(`   - Saved batch ${i} to ${i + chunkSlice.length}`);
                }
            } catch (err) {
                console.error(`❌ Network error saving batch ${i}:`, err);
            }
        }

        console.log("✅ Data import process finished.");
    }

    /**
     * Hybrid Search with improved types and scoring visibility.
     */
    static async searchVectors(
        queryText: string, 
        queryVector: number[], 
        limit: number
    ): Promise<SearchResult[]> {
        try {
            const searchRes = await weaviateClient.graphql
                .get()
                .withClassName('EmailChunk')
                .withFields('content emailId subject _additional { distance score }')
                .withHybrid({
                    query: queryText,
                    vector: queryVector,
                    alpha: 0.5 
                })
                .withLimit(limit)
                .do();

            const results = searchRes.data?.Get?.EmailChunk;

            if (!results) return [];

            return results.map((res: any) => ({
                content: res.content,
                emailId: res.emailId,
                subject: res.subject,
                similarity: parseFloat(Math.max(0, (1 - res._additional.distance) * 100).toFixed(2)),
                score: res._additional.score
            }));

        } catch (error) {
            console.error("❌ Search failed:", error);
            return [];
        }
    }
}