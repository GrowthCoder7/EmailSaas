import type { EmailChunkProperties } from "./weaviate-client.js";
import axios from "axios"

export class LLMService{
    static async generatePrompt(query:string,context:EmailChunkProperties[]):Promise<string>{
        const contextString=context.map((c)=>{
            return `Subject: ${c.subject}\nContent:${c.content}`;
        }).join('\n--\n')
    
        const prompt:string=`
            Instructions: [You are email client agent responsible for answering the query related to
            the provided context of the email],
            Context:${contextString}
            Query:${query},
        `
        return prompt;
    }
    
    static async generateAnswer(prompt:String):Promise<string>{
        try {
            const res = await axios.post('http://localhost:11434/api/generate',{
            model:"llama3.2",
            prompt,
            temperature:0.4,
            stream:false
        })
            return res.data.response;
        } catch (error) {
            console.error(error)
            return "Failed generation!"
        }
    }
}