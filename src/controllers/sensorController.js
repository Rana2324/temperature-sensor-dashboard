import moment from 'moment';
import SensorData from '../models/SensorData.js';
import Alert from '../models/Alert.js';
import Settings from '../models/Settings.js';
import Personality from '../models/Personality.js';
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

        const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
        const isAbnormal = avgTemp > config.sensors.temperatureThresholds.high || 
                          avgTemp < config.sensors.temperatureThresholds.low;

        const sensorData = new SensorData({
            sensorId,
            acquisitionDate: moment().format('YYYY/MM/DD'),
            acquisitionTime: moment().format('HH:mm:ss.SSS'),
            temperatures,
            averageTemperature: avgTemp,
            isAbnormal
        });

        // Save with timeout
        await timeoutPromise(sensorData.save(), 5000);

        if (isAbnormal) {
            // Create a more descriptive alert message
            let eventDescription = '';
            let eventType = 'ABNORMAL_DATA';
            let alertReason = '';
            
            if (avgTemp > config.sensors.temperatureThresholds.high) {
                eventDescription = `温度異常：${avgTemp.toFixed(1)}°C (${config.sensors.temperatureThresholds.high}°C以上)`;
                alertReason = 'HIGH_TEMPERATURE';
            } else if (avgTemp < config.sensors.temperatureThresholds.low) {
                eventDescription = `温度異常：${avgTemp.toFixed(1)}°C (${config.sensors.temperatureThresholds.low}°C以下)`;
                alertReason = 'LOW_TEMPERATURE';
            }

            const alert = new Alert({
                sensorId,
                temperature: avgTemp,
                event: eventDescription,
                eventType,
                details: {
                    threshold: {
                        high: config.sensors.temperatureThresholds.high,
                        low: config.sensors.temperatureThresholds.low
                    },
                    value: avgTemp
                }
            });

            await timeoutPromise(alert.save(), 5000);
            
            try {
                req.app.io.emit('alert', {
                    sensorId: alert.sensorId,
                    date: moment(alert.date).format('YYYY/MM/DD'),
                    time: moment(alert.date).format('HH:mm:ss.SSS'),
                    event: alert.event,
                    eventType: alert.eventType
                });
            } catch (socketError) {
                console.error('Socket.io emit error:', socketError);
            }
        }

        // Emit with all required data for frontend
        try {
            req.app.io.emit('newSensorData', {
                ...sensorData.toObject(),
                averageTemperature: avgTemp
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
                .sort({ timestamp: -1 })
                .limit(100)
                .lean(),
            5000
        );
        res.json(readings);
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
                .sort({ date: -1 })
                .limit(20)
                .lean(),
            5000
        );
        
        const formattedAlerts = alerts.map(alert => ({
            sensorId: alert.sensorId,
            date: moment(alert.date).format('YYYY/MM/DD'),
            time: moment(alert.date).format('HH:mm:ss.SSS'),
            event: alert.event,
            eventType: alert.eventType
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
        const sensorIds = ['SENSOR_1', 'SENSOR_2', 'SENSOR_3'];
        const latestReadings = await Promise.all(sensorIds.map(async (sensorId) => {
            const data = await SensorData.find({ sensorId })
                .sort({ timestamp: -1 })
                .limit(10);

            const alerts = await Alert.find({ sensorId })
                .sort({ date: -1 })
                .limit(5);

            const settings = await Settings.find({ sensorId })
                .sort({ date: -1 })
                .limit(5);

            const personality = await Personality.find({ sensorId })
                .sort({ date: -1 })
                .limit(5);

            return {
                sensorId,
                data: data.map(reading => ({
                    ...reading.toObject(),
                    acquisitionDate: moment(reading.timestamp).format('YYYY/MM/DD'),
                    acquisitionTime: moment(reading.timestamp).format('HH:mm:ss.SSS'),
                })),
                alerts: alerts.map(alert => ({
                    ...alert.toObject(),
                    date: moment(alert.date).format('YYYY/MM/DD'),
                    time: moment(alert.date).format('HH:mm:ss.SSS'),
                    event: alert.event
                })),
                settings: settings.map(setting => ({
                    ...setting.toObject(),
                    date: moment(setting.date).format('YYYY/MM/DD'),
                    time: moment(setting.date).format('HH:mm:ss.SSS'),
                    content: formatSettingContent(setting)
                })),
                personality: personality.map(p => ({
                    ...p.toObject(),
                    date: moment(p.date).format('YYYY/MM/DD'),
                    time: moment(p.date).format('HH:mm:ss.SSS'),
                    content: formatPersonalityContent(p)
                }))
            };
        }));

        res.render('index', { latestReadings });
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

// Settings update endpoint
export const updateSettings = async (req, res) => {
    try {
        const { sensorId, changeType, value } = req.body;
        const settings = new Settings({
            sensorId,
            changeType,
            value,
            date: new Date()
        });
        await settings.save();

        // Format the settings data
        const content = formatSettingContent(settings);
        
        const formattedSettings = {
            sensorId,
            date: moment(settings.date).format('YYYY/MM/DD'),
            time: moment(settings.date).format('HH:mm:ss.SSS'),
            content: content,
            // Keep the original data for reference if needed
            changeType: settings.changeType,
            value: settings.value
        };

        // Emit real-time update with formatted content
        req.app.io.emit('settingChange', formattedSettings);
        res.status(200).json(formattedSettings);
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Personality update endpoint
export const updatePersonality = async (req, res) => {
    try {
        const { sensorId, biasType, biasValue } = req.body;
        const personality = new Personality({
            sensorId,
            biasType,
            biasValue,
            date: new Date()
        });
        await personality.save();

        // Format the personality data
        const content = formatPersonalityContent(personality);
        
        const formattedPersonality = {
            sensorId,
            date: moment(personality.date).format('YYYY/MM/DD'),
            time: moment(personality.date).format('HH:mm:ss.SSS'),
            content: content,
            // Keep the original data for reference if needed
            biasType: personality.biasType,
            biasValue: personality.biasValue
        };

        // Emit real-time update with formatted content
        req.app.io.emit('personalityUpdate', formattedPersonality);
        res.status(200).json(formattedPersonality);
    } catch (error) {
        console.error('Error updating personality:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getSettings = async (req, res) => {
    try {
        console.log('Fetching settings...');
        const settings = await Settings.find().sort({ date: -1 }).limit(10).lean();
        
        if (!settings || settings.length === 0) {
            // Add default settings if none exist
            const defaultSettings = await Settings.create({
                sensorId: 'SENSOR_1',
                changeType: 'threshold',
                value: { high: 30, low: 20 },
                date: new Date()
            });
            settings.push(defaultSettings.toObject());
        }

        const formattedSettings = settings.map(setting => ({
            sensorId: setting.sensorId,
            date: moment(setting.date).format('YYYY/MM/DD'),
            time: moment(setting.date).format('HH:mm:ss.SSS'),
            content: formatSettingContent(setting)
        }));

        // console.log('Formatted settings:', formattedSettings);
        res.json(formattedSettings);
    } catch (error) {
        console.error('Error in getSettings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
};

export const getPersonality = async (req, res) => {
    try {
        console.log('Fetching personality data...');
        const personality = await Personality.find().sort({ date: -1 }).limit(10).lean();

        if (!personality || personality.length === 0) {
            // Add default personality if none exist
            const defaultPersonality = await Personality.create({
                sensorId: 'SENSOR_1',
                biasType: 'temperature_offset',
                biasValue: { offset: 0.5 },
                date: new Date()
            });
            personality.push(defaultPersonality.toObject());
        }

        const formattedPersonality = personality.map(p => ({
            sensorId: p.sensorId,
            date: moment(p.date).format('YYYY/MM/DD'),
            time: moment(p.date).format('HH:mm:ss.SSS'),
            content: formatPersonalityContent(p)
        }));

        // console.log('Formatted personality:', formattedPersonality);
        res.json(formattedPersonality);
    } catch (error) {
        console.error('Error in getPersonality:', error);
        res.status(500).json({ error: 'Failed to fetch personality data' });
    }
};

// Helper functions to format content readably
function formatSettingContent(setting) {
    if (setting.changeType === 'threshold' && setting.value) {
        const { high, low } = setting.value;
        return `しきい値（高: ${high}°C / 低: ${low}°C）`;
    }
    else if (setting.changeType === 'interval' && setting.value) {
        return `読取間隔変更: ${setting.value}ms`;
    }
    return `${setting.changeType}の設定変更`;
}

function formatPersonalityContent(personality) {
    if (personality.biasType === 'temperature_offset' && personality.biasValue) {
        const offset = personality.biasValue.offset;
        const sign = offset > 0 ? '+' : '';
        return `温度補正バイアス: ${sign}${offset}°C`;
    }
    else if (personality.biasType === 'sensitivity' && personality.biasValue) {
        return `感度設定: ${personality.biasValue.level}`;
    }
    return `${personality.biasType}の設定`;
}

// Custom alert creation endpoint for handling different alert types
export const createCustomAlert = async (req, res) => {
    try {
        const { sensorId, eventType, details } = req.body;
        
        if (!sensorId || !eventType) {
            return res.status(400).json({ error: 'Invalid alert data format' });
        }
        
        // Format the event description based on the event type
        let eventDescription = '';
        const isRecovery = eventType.includes('_RECOVERY');
        const baseEventType = isRecovery ? eventType.replace('_RECOVERY', '') : eventType;
        
        switch (baseEventType) {
            case 'THRESHOLD':
                eventDescription = `しきい値変更：高=${details.threshold ? details.threshold.high : ''}°C, 低=${details.threshold ? details.threshold.low : ''}°C`;
                if (isRecovery) {
                    eventDescription = `しきい値変更に関するアラート回復`;
                }
                break;
            case 'OFFSET':
                const sign = details.offset > 0 ? '+' : '';
                eventDescription = `温度オフセット：${sign}${details.offset}°C`;
                if (isRecovery) {
                    eventDescription = `温度オフセットに関するアラート回復`;
                }
                break;
            case 'SENSOR_ERROR':
                eventDescription = `センサーエラー：${details.message || '不明なエラー'}`;
                if (isRecovery) {
                    eventDescription = `センサーエラー回復：${details.message || '不明なエラー'}`;
                }
                break;
            case 'ABNORMAL_DATA':
                if (details.value > config.sensors.temperatureThresholds.high) {
                    eventDescription = `温度異常：${details.value.toFixed(1)}°C (${config.sensors.temperatureThresholds.high}°C以上)`;
                } else if (details.value < config.sensors.temperatureThresholds.low) {
                    eventDescription = `温度異常：${details.value.toFixed(1)}°C (${config.sensors.temperatureThresholds.low}°C以下)`;
                } else {
                    eventDescription = `温度異常：${details.value.toFixed(1)}°C`;
                }
                
                if (isRecovery) {
                    eventDescription = `温度異常回復：${details.value.toFixed(1)}°C (通常範囲:${config.sensors.temperatureThresholds.low}°C～${config.sensors.temperatureThresholds.high}°C)`;
                }
                break;
            default:
                eventDescription = details.message || (isRecovery ? 'アラート回復' : 'アラート発生');
        }
        
        const alert = new Alert({
            sensorId,
            event: eventDescription,
            eventType,
            temperature: details.value,
            details,
            date: new Date()
        });
        
        await alert.save();
        
        // Emit real-time update with the formatted alert
        req.app.io.emit('alert', {
            sensorId: alert.sensorId,
            date: moment(alert.date).format('YYYY/MM/DD'),
            time: moment(alert.date).format('HH:mm:ss.SSS'),
            event: alert.event,
            eventType: alert.eventType,
            isRecovery
        });
        
        res.status(201).json({
            message: 'Alert created successfully',
            alert: {
                sensorId: alert.sensorId,
                date: moment(alert.date).format('YYYY/MM/DD'),
                time: moment(alert.date).format('HH:mm:ss.SSS'),
                event: alert.event,
                eventType: alert.eventType,
                isRecovery
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
            SensorData.find({ sensorId })
                .sort({ timestamp: -1 })
                .limit(50)
                .lean(),
            5000
        );
        
        // Format the readings for the frontend
        const formattedReadings = readings.map(reading => ({
            ...reading,
            acquisitionDate: moment(reading.timestamp).format('YYYY/MM/DD'),
            acquisitionTime: moment(reading.timestamp).format('HH:mm:ss.SSS')
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