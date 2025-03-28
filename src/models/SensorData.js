import mongoose from 'mongoose';

const sensorDataSchema = new mongoose.Schema({
    sensor_id: {
        type: String,
        required: true
    },
    date: {
        type: String,
        required: true
    },
    time: {
        type: String,
        required: true
    },
    temperature_data: [{
        type: Number,
        required: true
    }],
    alert_flag: {
        type: Number,
        default: 0
    },
    created_at: {
        type: String,
        required: true
    }
});

export default mongoose.model('SensorData', sensorDataSchema, 'temperature_readings');