import moment from 'moment';
import SensorData from '../models/SensorData.js';
import Alert from '../models/Alert.js';
import { readFile } from 'fs/promises';

const config = JSON.parse(
    await readFile(new URL('../../config.json', import.meta.url))
);

// Add request timeout handler
const timeoutPromise = (promise, timeout) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
    ]);
};

export const storeSensorData = async (req, res) => {
    try {
        const { sensorId, temperatures } = req.body;

        // Validate request data
        if (!sensorId || !Array.isArray(temperatures) || temperatures.length === 0) {
            return res.status(400).json({ error: 'Invalid sensor data format' });
        }

        // Calculate average temperature
        const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
        
        // Check if temperature is abnormal based on thresholds
        const isAbnormal = avgTemp > config.sensors.temperatureThresholds.high || 
                          avgTemp < config.sensors.temperatureThresholds.low;
        
        // Format current date and time
        const now = new Date();
        const dateStr = moment(now).format('YYYY/MM/DD');
        const timeStr = moment(now).format('HH:mm:ss.SSS');
        const createdAtStr = dateStr + ' ' + timeStr;

        // Create sensor data document with the new schema
        const sensorData = new SensorData({
            sensor_id: sensorId,
            date: dateStr,
            time: timeStr,
            temperature_data: temperatures,
            alert_flag: isAbnormal ? 1 : 0,
            created_at: createdAtStr
        });

        // Save with timeout
        await timeoutPromise(sensorData.save(), 5000);

        // If abnormal temperature, create alert
        if (isAbnormal) {
            let alertReason = '';
            
            if (avgTemp > config.sensors.temperatureThresholds.high) {
                alertReason = `Temperature exceeded maximum threshold (${avgTemp.toFixed(1)}°C > ${config.sensors.temperatureThresholds.high}°C)`;
            } else if (avgTemp < config.sensors.temperatureThresholds.low) {
                alertReason = `Temperature below minimum threshold (${avgTemp.toFixed(1)}°C < ${config.sensors.temperatureThresholds.low}°C)`;
            }

            const alert = new Alert({
                sensor_id: sensorId,
                date: dateStr,
                time: timeStr,
                alert_reason: alertReason,
                status: 'active',
                created_at: createdAtStr
            });

            await timeoutPromise(alert.save(), 5000);
            
            try {
                req.app.io.emit('alert', {
                    sensorId: alert.sensor_id,
                    date: alert.date,
                    time: alert.time,
                    event: alert.alert_reason,
                    status: alert.status
                });
            } catch (socketError) {
                console.error('Socket.io emit error:', socketError);
            }
        }

        // Emit with all required data for frontend
        try {
            req.app.io.emit('newSensorData', {
                ...sensorData.toObject(),
                averageTemperature: avgTemp,
                sensorId: sensorData.sensor_id
            });
        } catch (socketError) {
            console.error('Socket.io emit error:', socketError);
        }
        
        res.status(201).json(sensorData);
    } catch (error) {
        console.error('Error storing sensor data:', error);
        
        // Handle specific error types
        if (error.message === 'Request timeout') {
            return res.status(504).json({ error: 'Request timeout' });
        } else if (error.name === 'ValidationError') {
            return res.status(400).json({ error: 'Invalid data format' });
        } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
            return res.status(503).json({ error: 'Database error' });
        }
        
        res.status(500).json({ error: 'Failed to store sensor data' });
    }
};

export const getLatestReadings = async (req, res) => {
    try {
        const readings = await timeoutPromise(
            SensorData.find()
                .sort({ created_at: -1 })  // Changed from timestamp to created_at
                .limit(100)
                .lean(),
            5000
        );
        
        // Format data to ensure backward compatibility with frontend
        const formattedReadings = readings.map(reading => ({
            ...reading,
            sensorId: reading.sensor_id,
            temperatures: reading.temperature_data,
            acquisitionDate: reading.date,
            acquisitionTime: reading.time,
            averageTemperature: reading.temperature_data.reduce((a, b) => a + b, 0) / reading.temperature_data.length,
            isAbnormal: reading.alert_flag === 1
        }));
        
        res.json(formattedReadings);
    } catch (error) {
        console.error('Error fetching sensor readings:', error);
        if (error.message === 'Request timeout') {
            return res.status(504).json({ error: 'Request timeout' });
        }
        res.status(500).json({ error: 'Failed to fetch sensor readings' });
    }
};

export const getAlertHistory = async (req, res) => {
    try {
        const alerts = await timeoutPromise(
            Alert.find()
                .sort({ created_at: -1 })
                .limit(20)
                .lean(),
            5000
        );
        
        // Format alerts to ensure compatibility with frontend
        const formattedAlerts = alerts.map(alert => ({
            sensorId: alert.sensor_id,
            date: alert.date,
            time: alert.time,
            event: alert.alert_reason,
            status: alert.status
        }));
        
        res.json(formattedAlerts);
    } catch (error) {
        console.error('Error fetching alert history:', error);
        if (error.message === 'Request timeout') {
            return res.status(504).json({ error: 'Request timeout' });
        }
        res.status(500).json({ error: 'Failed to fetch alert history' });
    }
};

export const getDashboard = async (req, res) => {
    try {
        // Include all possible sensor ID formats from your MongoDB database
        const sensorIds = ['sensor_1', 'D6T-001', 'D6T-002', 'D6T-003'];
        
        console.log('Fetching data for sensors:', sensorIds);
        
        const latestReadings = await Promise.all(sensorIds.map(async (sensorId) => {
            // Get temperature data
            const data = await SensorData.find({ sensor_id: sensorId })
                .sort({ created_at: -1 })
                .limit(20)
                .lean();
                
            console.log(`Found ${data.length} temperature readings for ${sensorId}`);

            // Get alert data
            const alerts = await Alert.find({ sensor_id: sensorId })
                .sort({ created_at: -1 })
                .limit(10)
                .lean();
                
            console.log(`Found ${alerts.length} alerts for ${sensorId}`);

            return {
                sensorId,
                data: data.map(reading => ({
                    ...reading,
                    temperatures: reading.temperature_data,
                    acquisitionDate: reading.date,
                    acquisitionTime: reading.time,
                    isAbnormal: reading.alert_flag === 1,
                    averageTemperature: reading.temperature_data && reading.temperature_data.length > 0 
                        ? reading.temperature_data.reduce((a, b) => a + b, 0) / reading.temperature_data.length
                        : 0
                })),
                alerts: alerts.map(alert => ({
                    sensorId: alert.sensor_id,
                    date: alert.date,
                    time: alert.time,
                    event: alert.alert_reason,
                    status: alert.status
                })),
                isActive: data.length > 0 || alerts.length > 0
            };
        }));

        // Filter out sensors with no data
        const activeReadings = latestReadings.filter(sensor => sensor.isActive);
        console.log(`Found ${activeReadings.length} active sensors with data`);
        
        // Render the dashboard with only MongoDB data
        res.render('index', { latestReadings: activeReadings });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const processSensorData = async (req, res) => {
    try {
        const { sensorId, temperatures } = req.body;
        const averageTemperature = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
        const isAbnormal = averageTemperature > 70 || averageTemperature < 20;

        const sensorData = new SensorData({
            sensorId,
            temperatures,
            averageTemperature,
            isAbnormal,
            timestamp: new Date()
        });

        await sensorData.save();

        // Create alert if temperature is abnormal
        if (isAbnormal) {
            const alert = new Alert({
                sensorId,
                event: '異常値取得',
                date: new Date()
            });
            await alert.save();
            req.app.io.emit('newAlert', {
                sensorId,
                date: moment(alert.date).format('YYYY/MM/DD'),
                time: moment(alert.date).format('HH:mm:ss.SSS'),
                event: alert.event
            });
        }

        // Emit the new sensor data
        req.app.io.emit('newSensorData', {
            sensorId,
            temperatures,
            averageTemperature,
            isAbnormal,
            acquisitionDate: moment().format('YYYY/MM/DD'),
            acquisitionTime: moment().format('HH:mm:ss.SSS')
        });

        res.status(200).json({ message: 'Data processed successfully' });
    } catch (error) {
        console.error('Error processing sensor data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Custom alert creation endpoint for handling different alert types
export const createCustomAlert = async (req, res) => {
    try {
        const { sensorId, eventType, details } = req.body;
        
        if (!sensorId || !eventType) {
            return res.status(400).json({ error: 'Invalid alert data format' });
        }
        
        // Format the event description based on the event type
        let alertReason = '';
        const isRecovery = eventType.includes('_RECOVERY');
        const baseEventType = isRecovery ? eventType.replace('_RECOVERY', '') : eventType;
        
        // Format current date and time
        const now = new Date();
        const dateStr = moment(now).format('YYYY/MM/DD');
        const timeStr = moment(now).format('HH:mm:ss.SSS');
        const createdAtStr = dateStr + ' ' + timeStr;
        
        switch (baseEventType) {
            case 'THRESHOLD':
                alertReason = `しきい値変更：高=${details.threshold ? details.threshold.high : ''}°C, 低=${details.threshold ? details.threshold.low : ''}°C`;
                if (isRecovery) {
                    alertReason = `しきい値変更に関するアラート回復`;
                }
                break;
            case 'OFFSET':
                const sign = details.offset > 0 ? '+' : '';
                alertReason = `温度オフセット：${sign}${details.offset}°C`;
                if (isRecovery) {
                    alertReason = `温度オフセットに関するアラート回復`;
                }
                break;
            case 'SENSOR_ERROR':
                alertReason = `センサーエラー：${details.message || '不明なエラー'}`;
                if (isRecovery) {
                    alertReason = `センサーエラー回復：${details.message || '不明なエラー'}`;
                }
                break;
            case 'ABNORMAL_DATA':
                if (details.value > config.sensors.temperatureThresholds.high) {
                    alertReason = `Temperature exceeded maximum threshold (${details.value.toFixed(1)}°C > ${config.sensors.temperatureThresholds.high}°C)`;
                } else if (details.value < config.sensors.temperatureThresholds.low) {
                    alertReason = `Temperature below minimum threshold (${details.value.toFixed(1)}°C < ${config.sensors.temperatureThresholds.low}°C)`;
                } else {
                    alertReason = `温度異常：${details.value.toFixed(1)}°C`;
                }
                
                if (isRecovery) {
                    alertReason = `温度異常回復：${details.value.toFixed(1)}°C (通常範囲:${config.sensors.temperatureThresholds.low}°C～${config.sensors.temperatureThresholds.high}°C)`;
                }
                break;
            default:
                alertReason = details.message || (isRecovery ? 'アラート回復' : 'アラート発生');
        }
        
        const alert = new Alert({
            sensor_id: sensorId,
            date: dateStr,
            time: timeStr,
            alert_reason: alertReason,
            status: isRecovery ? 'resolved' : 'active',
            created_at: createdAtStr
        });
        
        await alert.save();
        
        // Emit real-time update with the formatted alert
        req.app.io.emit('alert', {
            sensorId: alert.sensor_id,
            date: alert.date,
            time: alert.time,
            event: alert.alert_reason,
            status: alert.status
        });
        
        res.status(201).json({
            message: 'Alert created successfully',
            alert: {
                sensorId: alert.sensor_id,
                date: alert.date,
                time: alert.time,
                event: alert.alert_reason,
                status: alert.status
            }
        });
    } catch (error) {
        console.error('Error creating custom alert:', error);
        res.status(500).json({ error: 'Failed to create custom alert' });
    }
};

// New function to get data for a specific sensor by ID
export const getSensorDataById = async (req, res) => {
    try {
        const { sensorId } = req.params;
        
        if (!sensorId) {
            return res.status(400).json({ error: 'Sensor ID is required' });
        }
        
        const readings = await timeoutPromise(
            SensorData.find({ sensor_id: sensorId })  // Changed from sensorId to sensor_id
                .sort({ created_at: -1 })  // Changed from timestamp to created_at
                .limit(50)
                .lean(),
            5000
        );
        
        const formattedReadings = readings.map(reading => ({
            ...reading,
            sensorId: reading.sensor_id,
            acquisitionDate: reading.date,
            acquisitionTime: reading.time,
            temperatures: reading.temperature_data,
            averageTemperature: reading.temperature_data.reduce((a, b) => a + b, 0) / reading.temperature_data.length,
            isAbnormal: reading.alert_flag === 1
        }));
        
        res.json(formattedReadings);
    } catch (error) {
        console.error(`Error fetching data for sensor ${req.params.sensorId}:`, error);
        if (error.message === 'Request timeout') {
            return res.status(504).json({ error: 'Request timeout' });
        }
        res.status(500).json({ error: 'Failed to fetch sensor data' });
    }
};