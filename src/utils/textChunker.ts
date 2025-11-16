import { get_encoding } from 'tiktoken';

// Load the tokenizer for gpt-3.5-turbo and gpt-4 models
const encoding = get_encoding('cl100k_base');

/**
 * Splits a large text into smaller chunks based on a token limit.
 * It tries to split along paragraphs to maintain context.
 * @param text The large string of text to chunk.
 * @param tokenLimit The maximum number of tokens allowed per chunk.
 * @returns An array of text chunks.
 */
export const chunkTextByTokens = (text: string, tokenLimit: number = 4000): string[] => {
    console.log('Chunking text...');

    // 1. Split the text into paragraphs
    const paragraphs = text.split(/(\r\n|\n){2,}/).filter(p => p.trim().length > 0);

    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentTokenCount = 0;

    for (const paragraph of paragraphs) {
        // 2. Count tokens in the current paragraph
        const paragraphTokenCount = encoding.encode(paragraph).length;

        // If a single paragraph is too large, it must be split forcefully
        if (paragraphTokenCount > tokenLimit) {
            // Push the current chunk if it has content
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.join('\n\n'));
                currentChunk = [];
                currentTokenCount = 0;
            }
            // Force split the huge paragraph
            const words = paragraph.split(' ');
            let subChunk = '';
            for (const word of words) {
                const subChunkWithWord = subChunk + word + ' ';
                if (encoding.encode(subChunkWithWord).length > tokenLimit) {
                    chunks.push(subChunk);
                    subChunk = word + ' ';
                } else {
                    subChunk = subChunkWithWord;
                }
            }
            chunks.push(subChunk); // Push the remainder
            continue;
        }

        // 3. If adding the next paragraph exceeds the limit, push the current chunk
        if (currentTokenCount + paragraphTokenCount > tokenLimit) {
            chunks.push(currentChunk.join('\n\n'));
            // Start a new chunk
            currentChunk = [paragraph];
            currentTokenCount = paragraphTokenCount;
        } else {
            // 4. Otherwise, add the paragraph to the current chunk
            currentChunk.push(paragraph);
            currentTokenCount += paragraphTokenCount;
        }
    }

    // 5. Add the final chunk if it exists
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
    }

    console.log(`Successfully split text into ${chunks.length} chunks.`);
    return chunks;
};