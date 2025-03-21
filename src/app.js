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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

const app = express();

// Increase default timeout for all HTTP requests
http.globalAgent.keepAlive = true;
http.globalAgent.options.keepAlive = true;
http.globalAgent.maxSockets = 100;
https.globalAgent.keepAlive = true;
https.globalAgent.options.keepAlive = true;
https.globalAgent.maxSockets = 100;

const server = http.createServer({
    requestTimeout: 60000,  // 60 seconds
    keepAliveTimeout: 30000 // 30 seconds
}, app);

const io = new Server(server, {
    pingTimeout: 30000,
    pingInterval: 10000,
    transports: ['websocket', 'polling']
});

// Load configuration
const appConfig = JSON.parse(
    await readFile(new URL('../config.json', import.meta.url))
);

// MongoDB connection with updated options
mongoose.connect(appConfig.mongodb.uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000
}).then(() => {
    console.log('Connected to MongoDB at', appConfig.mongodb.uri);
    
    // Initialize models
    import('./models/Settings.js');
    import('./models/Personality.js');
    import('./models/Alert.js');
    import('./models/SensorData.js');
    
    console.log('Models initialized');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
});

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
    console.error('MongoDB error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
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
        } catch(e) {
            res.status(400).json({ error: 'Invalid JSON' });
            throw new Error('Invalid JSON');
        }
    }
}));

app.use(express.static(path.resolve(__dirname, '..', 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make io available to routes
app.io = io;

// Socket.IO connection with error handling
io.on('connection', (socket) => {
    console.log('Client connected');
    
    socket.on('error', (error) => {
        console.error('Socket.IO error:', error);
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Client disconnected:', reason);
    });
});

// Routes
app.use('/', indexRouter);

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err.stack);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = appConfig.server.port || 3000;
const HOST = appConfig.server.host || 'localhost';

server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
});

export { app, io };