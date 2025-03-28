import express from 'express';
import * as sensorController from '../controllers/sensorController.js';

const router = express.Router();

// Dashboard routes
router.get('/', sensorController.getDashboard);

// API routes
router.get('/api/sensor-data', sensorController.getLatestReadings);
router.get('/api/sensor-data/:sensorId/latest', sensorController.getSensorDataById);
router.post('/api/sensor-data', sensorController.storeSensorData);
router.post('/api/custom-alert', sensorController.createCustomAlert);
router.get('/api/alerts', sensorController.getAlertHistory);

export default router;