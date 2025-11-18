import amqp from 'amqplib';
import dotenv from 'dotenv';
import { performCvProcessing } from './processingLogic';
import { postNotification } from './services/apiClient';

dotenv.config();

const RABBIT_URL = process.env.RABBIT_URL!;
const CV_PROCESSING_QUEUE = 'cv_processing_queue';
const NOTIFICATION_QUEUE = 'notifications'; // Your notification service listens to this

const startWorker = async () => {
    console.log('🚀 Starting CV Worker Service...');
    try {
        const connection = await amqp.connect(RABBIT_URL);
        const channel = await connection.createChannel();
        
        await channel.assertQueue(CV_PROCESSING_QUEUE, { durable: true });
        await channel.assertQueue(NOTIFICATION_QUEUE, { durable: true });

        console.log(`[+] Waiting for jobs in ${CV_PROCESSING_QUEUE}. To exit press CTRL+C`);

        channel.consume(CV_PROCESSING_QUEUE, async (msg) => {
            if (msg) {
                const jobPayload = JSON.parse(msg.content.toString());
                console.log(`[->] Received job for candidate: ${jobPayload.candidateId}`);
                
                try {
                    await performCvProcessing(jobPayload);
                    // On success, publish a notification
                    const notification = { 
                        actorId: jobPayload.candidateId, 
                        title: 'Profile Updated!', 
                        description: 'Your CV has been processed and your profile is ready.' ,
                        accountType: 'Candidate'
                    };
                    await postNotification(notification);
                    
                } catch (error: any) {
                    console.error(`[!] Error processing CV for ${jobPayload.candidateId}:`, error.message);
                    
                    // On failure, publish an error notification.
                    const errorNotification = { 
                        actorId: jobPayload.candidateId, 
                        title: 'Processing Failed', 
                        description: 'We could not process your CV. Please try again or contact support.',
                        accountType: 'Candidate'
                    };
                    await postNotification(errorNotification);
                } finally {
                    channel.ack(msg); // Remove message from queue
                }
            }
        });
    } catch (error) {
        console.error('💀 Worker failed to start:', error);
        process.exit(1);
    }
};

startWorker();