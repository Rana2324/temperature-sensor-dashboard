import mongoose from 'mongoose';

const sensorDataSchema = new mongoose.Schema({
    sensorId: {
        type: String,
        required: true
    },
    acquisitionDate: {
        type: String,
        required: true
    },
    acquisitionTime: {
        type: String,
        required: true
    },
    temperatures: [{
        type: Number,
        required: true
    }],
    averageTemperature: {
        type: Number,
        required: true
    },
    isAbnormal: {
        type: Boolean,
        default: false
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('SensorData', sensorDataSchema);