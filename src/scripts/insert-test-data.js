import mongoose from 'mongoose';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import Alert from '../models/Alert.js';

// Load configuration
const appConfig = JSON.parse(
    await readFile(new URL('../../config.json', import.meta.url))
);

async function insertTestData() {
    try {
        await mongoose.connect(appConfig.mongodb.uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: appConfig.mongodb.dbName
        });

        console.log('Connected to MongoDB');

        // Create some test alerts
        const testAlerts = [
            {
                sensorId: 'SENSOR001',
                date: new Date(),
                alertReason: 'High Temperature',
                status: 'active'
            },
            {
                sensorId: 'SENSOR002',
                date: new Date(),
                alertReason: 'Low Temperature',
                status: 'recovered'
            },
            {
                sensorId: 'SENSOR001',
                date: new Date(Date.now() - 3600000), // 1 hour ago
                alertReason: 'Temperature Spike',
                status: 'recovered'
            }
        ];

        // Insert the test data
        const result = await Alert.insertMany(testAlerts);
        console.log('Inserted test alerts:', result.length);
        console.log('Sample alert:', result[0]);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

insertTestData(); 