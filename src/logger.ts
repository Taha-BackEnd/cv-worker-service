import path from 'path/win32';
import winston from 'winston';
import 'winston-daily-rotate-file';
import dotenv from 'dotenv';
dotenv.config();

const logDirectory = process.env.LOG_DIRECTORY_PATH;
if (!logDirectory) {
    console.error("LOG_DIRECTORY_PATH is not defined in .env file. Falling back to local './logs' directory.");
}
const finalLogPath = logDirectory || path.join(process.cwd(), 'logs');

// Define the different transports (where the logs will go)
const transports = [
    // 1. Console Transport: For readable logs in your terminal during development.
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(), // Add colors
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            // Create a custom, readable format for the console
            winston.format.printf(info => {
                const { timestamp, level, message, ...meta } = info;
                // Check if there is metadata (like candidateId)
                const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
                return `${timestamp} ${level}: ${message} ${metaString}`;
            })
        )
    }),

    // 2. Daily Rotate File Transport: For structured logs saved to files.
    new winston.transports.DailyRotateFile({
        level: 'info', // Log info level and above (info, warn, error)
        dirname: finalLogPath, 
        filename: 'cv-service-%DATE%.log', // Filename pattern
        datePattern: 'YYYY-MM-DD', // Rotate daily
        zippedArchive: true, // Compress old log files
        maxSize: '20m', // Max size of a log file before a new one is created
        // maxFiles: '14d', // Keep logs for 14 days
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json() // Log in JSON format for easy parsing
        )
    })
];

// Create the logger instance
const logger = winston.createLogger({
    level: 'info', // The default minimum level to log
    transports: transports,
    exitOnError: false // Do not exit on handled exceptions
});

export default logger;