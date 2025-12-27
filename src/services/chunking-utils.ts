export function smartChunk(text: string, chunkSize: number, overlap: number): string[] {
    const words = text.split(/\s+/); 
    
    const chunks: string[] = [];
    const step:number = chunkSize-overlap;
    
    for(let i=0;i<words.length;i+=step){
        const slice=words.slice(i,chunkSize+i)
        const chunkText=slice.join(" ")
        chunks.push(chunkText)
    }
    
    return chunks;
}