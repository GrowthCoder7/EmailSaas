import weaviate, { type WeaviateClient, ApiKey } from 'weaviate-ts-client';

// 1. Create the Client Instance
export const weaviateClient: WeaviateClient = weaviate.client({
    scheme: 'http',
    host: 'localhost:8080'
});

// 2. Define the Schema Structure
const EMAIL_CHUNK_SCHEMA = {
    class: 'EmailChunk', // The "Table" Name
    description: 'A semantic chunk of an email',
    vectorizer: 'none', 
    properties: [
        {
            name: 'content',
            dataType: ['text'], // The actual text content
            description: 'The text content of the chunk',
        },
        {
            name: 'emailId',
            dataType: ['text'], // Reference to the original email ID
            description: 'ID of the parent email',
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
     * Run this once when the app starts.
     * It checks if the "Table" exists. If not, it creates it.
     */
    static async initSchema() {
        try {
            // Check if schema already exists
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
        }
    }

    static async saveChunks(chunks: string[], vectors: number[][], emailId: string) {
        if (chunks.length !== vectors.length) {
            throw new Error("Mismatch: Number of chunks and vectors must be equal.");
        }

        console.log(`💾 Saving ${chunks.length} chunks to Weaviate...`);

        // Initialize a batcher
        const batcher = weaviateClient.batch.objectsBatcher();

        for (let i = 0; i < chunks.length; i++) {
            const chunkObj = {
                class: 'EmailChunk',
                properties: {
                    content: chunks[i],
                    emailId: emailId,
                },
                vector: vectors[i]!,
            };

            if(chunkObj.properties.content==null || chunkObj.properties.emailId==null || chunkObj.vector==null) {
                console.log("Error in batching")
            }else{
                batcher.withObject(chunkObj);
            }
        }

        // Send the "truck"
        const result = await batcher.do();
        
        // Check for errors in the response
        const errors = result.filter(r => r.result?.errors);
        if (errors.length > 0) {
            console.error("❌ Error saving to Weaviate:", JSON.stringify(errors, null, 2));
            throw new Error("Failed to save chunks.");
        }

        console.log("✅ Data saved successfully!");
    }
}