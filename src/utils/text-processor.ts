export class TextProcessor {
    static process(rawText: string): string[] {
        // 1. Clean
        let clean = this.cleanText(rawText);
        
        // 2. Chunk
        return this.chunkText(clean);
    }

    private static cleanText(rawText: string): string {
    const lines = rawText.replace(/\r\n/g, '\n').split('\n');
    
    const cleanLines: string[] = [];
    
    const REPLY_HEADERS = [
        /^On\s.+wrote:$/i,                
        /^From:\s.+$/i,                  
        /^-+Original Message-+$/i,        
        /^_{10,}$/,                      
        /^>+/                            
    ];

    const NOISE_PATTERNS = [
        /^Sent from my .+$/i,             
        /^Get Outlook for .+$/i,          
        /^--\s*$/,                        
        /^\s*$/                           
    ];

    for (const line of lines) {
        const trimmed = line.trim();

        const isReplyHeader = REPLY_HEADERS.some(pattern => pattern.test(trimmed));
        if (isReplyHeader) {
            break; 
        }

        const isNoise = NOISE_PATTERNS.some(pattern => pattern.test(trimmed));
        if (isNoise) {
            continue; 
        }

        cleanLines.push(trimmed);
    }

    return cleanLines.join('\n');
}

    private static chunkText(text: string, maxLength: number = 1000): string[] {
        if (!text || text.trim().length === 0) return [];
        
        const words = text.split(/\s+/);
        const chunks: string[] = [];
        let currentChunk: string[] = [];
        let currentLength = 0;

        for (const word of words) {
            if ((currentLength + word.length + 1) > maxLength) {
                if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));
                currentChunk = [word];
                currentLength = word.length;
            } else {
                currentChunk.push(word);
                currentLength += (word.length + 1);
            }
        }

        if (currentChunk.length > 0) chunks.push(currentChunk.join(' '));
        
        return chunks;
    }
}