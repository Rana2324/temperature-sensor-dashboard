import express from 'express';
import * as sensorController from '../controllers/sensorController.js';
import Settings from '../models/Settings.js';
import Personality from '../models/Personality.js';

const router = express.Router();

// Dashboard routes
router.get('/', sensorController.getDashboard);

// API routes
router.get('/api/sensor-data', (req, res, next) => {
    // console.log('GET /api/sensor-data called');
    sensorController.getLatestReadings(req, res, next);
});

router.post('/api/sensor-data', (req, res, next) => {
    // console.log('POST /api/sensor-data called with body:', req.body);
    sensorController.storeSensorData(req, res, next);
});

router.post('/api/custom-alert', (req, res, next) => {
    // console.log('POST /api/custom-alert called with body:', req.body);
    sensorController.createCustomAlert(req, res, next);
});

router.get('/api/alerts', (req, res, next) => {
    // console.log('GET /api/alerts called');
    sensorController.getAlertHistory(req, res, next);
});

router.get('/api/settings', (req, res, next) => {
    // console.log('GET /api/settings called');
    sensorController.getSettings(req, res, next);
});

router.post('/api/settings', (req, res, next) => {
    // console.log('POST /api/settings called with body:', req.body);
    sensorController.updateSettings(req, res, next);
});

router.get('/api/personality', (req, res, next) => {
    // console.log('GET /api/personality called');
    sensorController.getPersonality(req, res, next);
});

router.post('/api/personality', (req, res, next) => {
    // console.log('POST /api/personality called with body:', req.body);
    sensorController.updatePersonality(req, res, next);
});

// Test route to initialize sample data
router.post('/api/initialize-test-data', async (req, res) => {
    try {
        // Add test settings
        await Settings.create({
            sensorId: 'SENSOR_1',
            changeType: 'threshold',
            value: { high: 75, low: 15 },
            date: new Date()
        });

        // Add test personality
        await Personality.create({
            sensorId: 'SENSOR_1',
            biasType: 'temperature_bias',
            biasValue: { offset: 1.5 },
            date: new Date()
        });

        res.json({ message: 'Test data initialized successfully' });
    } catch (error) {
        console.error('Error initializing test data:', error);
        res.status(500).json({ error: 'Failed to initialize test data' });
    }
});

export default router;