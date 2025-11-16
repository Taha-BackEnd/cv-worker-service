import mammoth from 'mammoth';
import { PDFExtract, PDFExtractOptions } from 'pdf.js-extract';

/**
 * Extracts raw text from a LOCAL CV file.
 * @param localFilePath The path to the file on the local server disk.
 * @returns A promise that resolves to the extracted text.
 */
export async function extractTextFromCv(localFilePath: string): Promise<string> {
    console.log(`Extracting text from LOCAL file: ${localFilePath}`);
    const lowerCasePath = localFilePath.toLowerCase();

    try {
        if (lowerCasePath.endsWith('.pdf')) {
            // Initialize the new PDF extractor
            const pdfExtract = new PDFExtract();
            const options: PDFExtractOptions = {}; 

            const data = await pdfExtract.extract(localFilePath, options);

            // The library returns an object with pages. 
            // We need to map over them and join the text content.
            const fullText = data.pages.map(page => 
                page.content.map(item => item.str).join(' ')
            ).join('\n');
            
            return fullText;

        } else if (lowerCasePath.endsWith('.docx')) {
            const { value } = await mammoth.extractRawText({ path: localFilePath });
            return value;
        } else {
            throw new Error(`Unsupported file type: ${localFilePath}`);
        }
    } catch (error) {
        console.error(`Failed to parse local file ${localFilePath}:`, error);
        throw new Error('Could not read or parse the local CV file.');
    }
}