import axios from 'axios';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Downloads a file from a URL to a temporary local path.
 * @param url The URL of the file to download.
 * @returns A promise that resolves to the temporary local file path.
 */
export const downloadFileFromUrl = async (url: string): Promise<string> => {
    try {
        // 1. Generate a unique temporary file path
        // os.tmpdir() gives you the system's default temp directory (e.g., /tmp on Linux)
        const tempFilePath = path.join(os.tmpdir(), `cv-${Date.now()}-${path.basename(url)}`);
        console.log(`Downloading file to temporary path: ${tempFilePath}`);

        // 2. Create a writable stream to save the file
        const writer = fs.createWriteStream(tempFilePath);

        // 3. Make an HTTP request with axios, getting the response as a stream
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
        });

        // 4. Pipe the downloaded data into the file stream
        response.data.pipe(writer);

        // 5. Return a promise that resolves when the download is complete
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(tempFilePath));
            writer.on('error', (err) => {
                console.error('Stream writer error:', err);
                reject(err);
            });
        });

    } catch (error) {
        console.error(`Failed to download file from URL: ${url}`, error);
        throw new Error('Could not download the CV file from the provided URL.');
    }
};