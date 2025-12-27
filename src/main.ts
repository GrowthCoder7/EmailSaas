import { VectorDbService } from "./services/weaviate-client.js";
import { EmbeddingService } from "./services/embeddings-service.js";
import { LLMService } from "./services/LLMService.js";
import { smartChunk } from "./services/chunking-utils.js";

// --- A. The Ingestion Flow (Write Path) ---
async function ingestEmail(emailId: string, subject: string, body: string) {
    console.log(`\n📥 Ingesting Email: "${subject}"`);
    const context=`${subject}.${body}`
    const chunks=smartChunk(context,150,30);
    
    if (chunks.length === 0) return;

    // 2. Embedding: Convert text -> vectors locally
    const vectors = await EmbeddingService.getEmbeddingsBatch(chunks);
    
    // 3. Storage: Save text + vectors to Weaviate
    await VectorDbService.saveChunks(chunks, vectors, emailId, subject);
}

// --- B. The Retrieval Flow (Read Path) ---
async function askMyEmails(question: string) {
    console.log(`\n🕵️  User asks: "${question}"`);

    // 1. Vectorize the User's Query
    const queryVector = await EmbeddingService.getEmbedding(question);

    // 2. Search Weaviate (Hybrid Search)
    const searchResults = await VectorDbService.searchVectors(question, queryVector, 3);
    
    if (searchResults.length === 0) {
        console.log("No relevant emails found.");
        return;
    }

    console.log(`   Found ${searchResults.length} relevant context chunks.`);

    // 3. Prepare the Prompt
    const prompt = await LLMService.generatePrompt(question, searchResults);

    // 4. Generate Answer via Local LLM
    process.stdout.write("   🤖 AI Thinking...");
    const answer = await LLMService.generateAnswer(prompt);
    
    console.log("\n\n🤖 ANSWER:");
    console.log("-----------------------------------");
    console.log(answer.trim());
    console.log("-----------------------------------");
}

// --- C. Main Execution Block ---
(async () => {
    try {
        // 1. Initialize the DB
        await VectorDbService.initSchema();

        // 2. Add some dummy emails
        await ingestEmail(
            "email_001",
            "Project Alpha Deadline",
            "The deadline for Project Alpha has been moved to next Friday. Please update the roadmap."
        );

        await ingestEmail(
            "email_002",
            "Office Party",
            "The holiday party will be at the rooftop bar at 6 PM. Tacos will be served."
        );

        // 3. Ask Questions
        await askMyEmails("When is the project deadline?");
        await askMyEmails("Where is the party?");

    } catch (e) {
        console.error("❌ Application failed:", e);
    }
})();