import axios from 'axios';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const config = JSON.parse(
    await readFile(new URL('../../config.json', import.meta.url))
);

class SensorSimulator {
    constructor(sensorId) {
        this.sensorId = sensorId;
        this.running = false;
        this.errorPatterns = [
            { type: 'SENSOR_ERROR', details: { message: '通信失敗' }},
            { type: 'SENSOR_ERROR', details: { message: 'キャリブレーション不良' }},
            { type: 'SENSOR_ERROR', details: { message: '電源電圧変動' }},
            { type: 'THRESHOLD', details: { threshold: { high: 75, low: 15 }}},
            { type: 'OFFSET', details: { offset: 1.5 }}
        ];
        this.simulateErrorCounter = 0;
        console.log(`Initializing ${sensorId}`);
    }

    generateTemperatureData() {
        // Occasionally generate anomalous data for testing alerts
        this.simulateErrorCounter++;
        
        // Every 15 cycles, simulate a specific type of error
        if (this.simulateErrorCounter % 15 === 0) {
            const errorChoice = Math.floor(Math.random() * this.errorPatterns.length);
            const errorPattern = this.errorPatterns[errorChoice];
            
            // Report a simulated error
            this.reportAlert(errorPattern.type, errorPattern.details);
            
            // For some error types, return abnormal temperature data
            if (errorPattern.type === 'OFFSET') {
                const baseTemp = 25 + Math.random() * 5;
                const pixels = [];
                for (let i = 0; i < 16; i++) {
                    pixels.push(+(baseTemp + (Math.random() * 2 - 1)).toFixed(1));
                }
                return pixels;
            }
        }
        
        // Decide whether to generate normal or abnormal temperature
        const isAbnormal = Math.random() < 0.1; // 10% chance of abnormal temp
        
        let baseTemp;
        if (isAbnormal) {
            // Generate a temperature that's either too high or too low
            const isHigh = Math.random() < 0.5;
            if (isHigh) {
                baseTemp = 75 + Math.random() * 10; // High temp > 70°C
                // Report abnormal data alert
                this.reportAlert('ABNORMAL_DATA', { 
                    value: baseTemp,
                    threshold: config.sensors.temperatureThresholds.high
                });
            } else {
                baseTemp = 15 - Math.random() * 10;   // Low temp < 20°C
                // Report abnormal data alert
                this.reportAlert('ABNORMAL_DATA', { 
                    value: baseTemp,
                    threshold: config.sensors.temperatureThresholds.low
                });
            }
        } else {
            // Generate a normal temperature
            baseTemp = 25 + Math.random() * 5;
        }
        
        const pixels = [];
        for (let i = 0; i < 16; i++) {
            pixels.push(+(baseTemp + (Math.random() * 2 - 1)).toFixed(1));
        }
        
        console.log(`${this.sensorId} generated temperatures:`, pixels[0], '...', pixels[15]);
        return pixels;
    }

    async reportAlert(eventType, details) {
        try {
            await axios.post('http://localhost:3000/api/custom-alert', {
                sensorId: this.sensorId,
                eventType,
                details
            });
            console.log(`${this.sensorId} reported alert: ${eventType}`);
        } catch (error) {
            console.error(`${this.sensorId} failed to report alert:`, error.message);
        }
    }

    async sendData() {
        try {
            const temperatures = this.generateTemperatureData();
            const data = {
                sensorId: this.sensorId,
                temperatures
            };

            const response = await axios.post('http://localhost:3000/api/sensor-data', data);
            console.log(`${this.sensorId} data sent successfully:`, response.status);
        } catch (error) {
            console.error(`${this.sensorId} error:`, error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
        }
    }

    start() {
        console.log(`Starting ${this.sensorId}`);
        this.running = true;
        this.run();
    }

    stop() {
        console.log(`Stopping ${this.sensorId}`);
        this.running = false;
    }

    run() {
        if (!this.running) return;
        
        this.sendData().catch(err => {
            console.error(`${this.sensorId} run error:`, err.message);
        });
        
        setTimeout(() => this.run(), config.sensors.readingInterval);
    }
}

console.log('Starting sensor simulator...');
console.log('Server URL:', 'http://localhost:3000/api/sensor-data');
console.log('Update interval:', config.sensors.readingInterval, 'ms');

// Create and start three sensor simulators
const sensors = [];
for (let i = 1; i <= 3; i++) {
    const sensor = new SensorSimulator(`SENSOR_${i}`);
    sensors.push(sensor);
    sensor.start();
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down sensors...');
    sensors.forEach(sensor => sensor.stop());
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});