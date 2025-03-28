import express from 'express';
import mongoose from 'mongoose';
import path from 'path';
import cors from 'cors';
import http from 'http';
import https from 'https';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFile } from 'fs/promises';
import { config } from 'dotenv';
import indexRouter from './routes/index.js';
import Alert from './models/Alert.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

const app = express();

// Load configuration
const appConfig = JSON.parse(
    await readFile(new URL('../config.json', import.meta.url))
);

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// MongoDB connection with updated options
mongoose.connect(appConfig.mongodb.uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: appConfig.mongodb.dbName,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000
}).then(() => {
    console.log('Connected to MongoDB at', appConfig.mongodb.uri);
    console.log('Using database:', appConfig.mongodb.dbName);

    // Watch for changes in the alerts collection
    const alertsChangeStream = mongoose.model('Alert').watch();

    alertsChangeStream.on('change', (change) => {
        console.log('Change detected:', change.operationType);

        if (change.operationType === 'insert') {
            // New alert created
            Alert.findById(change.fullDocument._id)
                .then(alert => {
                    if (alert) {
                        io.emit('newAlert', alert);
                    }
                })
                .catch(err => console.error('Error fetching new alert:', err));
        } else if (change.operationType === 'update') {
            // Alert updated
            Alert.findById(change.documentKey._id)
                .then(alert => {
                    if (alert) {
                        io.emit('updateAlert', alert);
                    }
                })
                .catch(err => console.error('Error fetching updated alert:', err));
        }
    });

}).catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
});

// Middleware
app.use(cors({
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        try {
            JSON.parse(buf);
        } catch (e) {
            res.status(400).json({ error: 'Invalid JSON' });
            throw new Error('Invalid JSON');
        }
    }
}));

app.use(express.static(path.resolve(__dirname, '..', 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected');

    // Send initial data
    socket.emit('initialData', {
        sensorData: {
            sensorId: 'SENSOR001',
            acquisitionDate: new Date().toLocaleDateString('ja-JP'),
            acquisitionTime: new Date().toLocaleTimeString('ja-JP'),
            temperatures: Array(16).fill().map(() => (20 + Math.random() * 10).toFixed(1)),
            averageTemperature: 25 + Math.random() * 5,
            isAbnormal: Math.random() > 0.8
        }
    });

    // Set up intervals for real-time updates
    const sensorInterval = setInterval(() => {
        const sensorData = {
            sensorId: 'SENSOR001',
            acquisitionDate: new Date().toLocaleDateString('ja-JP'),
            acquisitionTime: new Date().toLocaleTimeString('ja-JP'),
            temperatures: Array(16).fill().map(() => (20 + Math.random() * 10).toFixed(1)),
            averageTemperature: 25 + Math.random() * 5,
            isAbnormal: Math.random() > 0.8
        };
        socket.emit('sensorUpdate', sensorData);
    }, 1000);

    const settingsInterval = setInterval(() => {
        const setting = {
            sensorId: 'SENSOR001',
            date: new Date().toLocaleDateString('ja-JP'),
            time: new Date().toLocaleTimeString('ja-JP'),
            content: `温度しきい値変更: ${(20 + Math.random() * 10).toFixed(1)}°C`
        };
        socket.emit('settingUpdate', setting);
    }, 5000);

    const personalityInterval = setInterval(() => {
        const personality = {
            sensorId: 'SENSOR001',
            date: new Date().toLocaleDateString('ja-JP'),
            time: new Date().toLocaleTimeString('ja-JP'),
            content: `温度補正値: ${(Math.random() * 2 - 1).toFixed(2)}°C`
        };
        socket.emit('personalityUpdate', personality);
    }, 5000);

    socket.on('error', (error) => {
        console.error('Socket.IO error:', error);
    });

    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', reason);
        clearInterval(sensorInterval);
        clearInterval(settingsInterval);
        clearInterval(personalityInterval);
    });
});

// Routes
app.get('/', async (req, res) => {
    try {
        // Fetch alerts with proper sorting
        const alerts = await Alert.find()
            .sort({ createdAt: -1 })
            .lean()
            .exec();

        // Create dummy sensor data for testing with all sections populated
        const latestReadings = [{
            sensorId: 'SENSOR001',
            isActive: true,
            // Sensor data history
            data: Array(100).fill().map((_, index) => ({
                acquisitionDate: new Date().toLocaleDateString('ja-JP'),
                acquisitionTime: new Date().toLocaleTimeString('ja-JP'),
                temperatures: Array(16).fill().map(() => (20 + Math.random() * 10).toFixed(1)),
                averageTemperature: 25 + Math.random() * 5,
                isAbnormal: Math.random() > 0.8
            })),
            // Settings history
            settings: Array(10).fill().map((_, index) => ({
                date: new Date().toLocaleDateString('ja-JP'),
                time: new Date().toLocaleTimeString('ja-JP'),
                content: `温度しきい値変更: ${(20 + Math.random() * 10).toFixed(1)}°C`
            })),
            // Personality/bias history
            personality: Array(10).fill().map((_, index) => ({
                date: new Date().toLocaleDateString('ja-JP'),
                time: new Date().toLocaleTimeString('ja-JP'),
                content: `温度補正値: ${(Math.random() * 2 - 1).toFixed(2)}°C`
            }))
        }];

        // Render the template with the data
        res.render('index', {
            alerts: alerts,
            latestReadings: latestReadings
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// API endpoint for real-time sensor data updates
app.get('/api/sensor-data/latest', (req, res) => {
    const sensorData = {
        sensorId: 'SENSOR001',
        acquisitionDate: new Date().toLocaleDateString('ja-JP'),
        acquisitionTime: new Date().toLocaleTimeString('ja-JP'),
        temperatures: Array(16).fill().map(() => (20 + Math.random() * 10).toFixed(1)),
        averageTemperature: 25 + Math.random() * 5,
        isAbnormal: Math.random() > 0.8
    };
    res.json(sensorData);
});

// API endpoint for settings updates
app.get('/api/settings', (req, res) => {
    const setting = {
        sensorId: 'SENSOR001',
        date: new Date().toLocaleDateString('ja-JP'),
        time: new Date().toLocaleTimeString('ja-JP'),
        content: `温度しきい値変更: ${(20 + Math.random() * 10).toFixed(1)}°C`
    };
    res.json([setting]);
});

// API endpoint for personality/bias updates
app.get('/api/personality', (req, res) => {
    const personality = {
        sensorId: 'SENSOR001',
        date: new Date().toLocaleDateString('ja-JP'),
        time: new Date().toLocaleTimeString('ja-JP'),
        content: `温度補正値: ${(Math.random() * 2 - 1).toFixed(2)}°C`
    };
    res.json([personality]);
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Global error:', err.stack);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// Start server
const PORT = appConfig.server.port || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

export { app, io };