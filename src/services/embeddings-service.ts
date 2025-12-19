import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

export class EmbeddingService {
    private static pipe: FeatureExtractionPipeline | null = null;

    private static async getPipeline() {
        if (!this.pipe) {
            this.pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            console.log("✅ Model loaded!");
        }
        return this.pipe;
    }

    /**
     * Converts text into a Vector (array of 384 numbers).
     */
    static async getEmbedding(text: string): Promise<number[]> {
        const pipe = await this.getPipeline();
        
        // Clean newlines
        const cleanText = text.replace(/\n/g, ' ');

        // Generate embedding
        // pooling: 'mean' averages the token vectors to get one sentence vector
        // normalize: true ensures the vector is ready for cosine similarity search
        const output = await pipe(cleanText, { pooling: 'mean', normalize: true });

        // Convert Tensor to standard JavaScript array
        return Array.from(output.data);
    }

    /**
     * Batch process multiple strings.
     */
    static async getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
        const pipe = await this.getPipeline();
        const cleanTexts = texts.map(t => t.replace(/\n/g, ' '));

        const vectors: number[][] = [];

        // Processing sequentially to avoid memory spikes
        for (const text of cleanTexts) {
            const output = await pipe(text, { pooling: 'mean', normalize: true });
            vectors.push(Array.from(output.data));
        }

        return vectors;
    }
}