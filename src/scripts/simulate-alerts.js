import mongoose from 'mongoose';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import Alert from '../models/Alert.js';

// Load configuration
const appConfig = JSON.parse(
    await readFile(new URL('../../config.json', import.meta.url))
);

const sensorIds = ['SENSOR001', 'SENSOR002', 'SENSOR003'];
const alertReasons = [
    'High Temperature',
    'Low Temperature',
    'Temperature Spike',
    'Sensor Malfunction',
    'Connection Lost'
];

async function generateRandomAlert() {
    return {
        sensorId: sensorIds[Math.floor(Math.random() * sensorIds.length)],
        date: new Date(),
        alertReason: alertReasons[Math.floor(Math.random() * alertReasons.length)],
        status: Math.random() > 0.7 ? 'recovered' : 'active'
    };
}

async function simulateAlerts() {
    try {
        await mongoose.connect(appConfig.mongodb.uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: appConfig.mongodb.dbName
        });

        console.log('Connected to MongoDB');

        // Generate a new alert every 5 seconds
        setInterval(async () => {
            try {
                const newAlert = await generateRandomAlert();
                const alert = await Alert.create(newAlert);
                console.log('Created new alert:', alert);

                // Simulate status updates for active alerts
                if (alert.status === 'active') {
                    setTimeout(async () => {
                        try {
                            await Alert.findByIdAndUpdate(alert._id, {
                                status: 'recovered'
                            });
                            console.log('Updated alert status to recovered:', alert._id);
                        } catch (error) {
                            console.error('Error updating alert:', error);
                        }
                    }, Math.random() * 20000 + 10000); // Random time between 10-30 seconds
                }
            } catch (error) {
                console.error('Error creating alert:', error);
            }
        }, 5000);

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

simulateAlerts(); 