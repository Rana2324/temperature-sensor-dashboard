import axios from 'axios';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const config = JSON.parse(readFileSync(join(__dirname, '../../config.json')));

console.log("Sensor simulator is running in view-only mode. No new data will be generated.");
console.log("Displaying existing data from MongoDB database:", config.mongodb.uri);
console.log("Press Ctrl+C to exit.");

// No sensor simulators will be created or started
// This ensures we only see the actual MongoDB data

// Keep the process running without generating data
setInterval(() => {
    // Log message every 10 seconds as a heartbeat
    console.log(`[${new Date().toLocaleTimeString()}] Running in view-only mode. Press Ctrl+C to exit.`);
}, 10000);

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down...');
    process.exit(0);
});