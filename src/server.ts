import express from 'express';
import cors from 'cors';
import { VectorDbService } from './services/weaviate-client.js';
import { EmbeddingService } from './services/embeddings-service.js';
import { LLMService } from './services/LLMService.js';
import { smartChunk } from './services/chunking-utils.js';

const app = express();
app.use(express.json()); 
app.use(cors());         

const PORT = 3000;


async function handleIngest(req: express.Request, res: express.Response) {
    try {
        const {emailId,subject,body} = req.body;
        if(!emailId || !subject || !body) 
            return res.status(400).json("Missing required fields in the email")
        const context = `${subject}.${body}`
        const chunks:string[] = smartChunk(context,150,30);
        const embeddings = await EmbeddingService.getEmbeddingsBatch(chunks);
        await VectorDbService.saveChunks(chunks,embeddings,emailId,subject);
        return res.json({"success":true})
    } catch (error) {
        return res.status(500).json({msg:"Error in ingesting mail"})
    }
}

async function handleChat(req: express.Request, res: express.Response) {
    try {
        const {query} = req.body;
        const vectors = await EmbeddingService.getEmbedding(query);
        const results = await VectorDbService.searchVectors(query,vectors,6);
        if(!results || results.length==0)
             return res.status(404).json({msg:"Couldn't find any relevant information"});
        const prompt = await LLMService.generatePrompt(query,results);
        const answer = await LLMService.generateAnswer(prompt)
        return res.status(201).json({"msg":answer})
    } catch (error) {
        return res.status(500).json({msg:error})
    }
}


// @ts-ignore
app.post('/ingest', handleIngest);
// @ts-ignore
app.post('/chat', handleChat);

async function server(){
    try {
        console.log("⏳ Initializing Database...");
        await VectorDbService.initSchema();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    } catch (e) {
        console.error("Failed to start server:", e);
    }
}
server();