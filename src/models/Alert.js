import mongoose from 'mongoose';

const AlertSchema = new mongoose.Schema({
    sensorId: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    event: {
        type: String,
        required: true
    },
    temperature: {
        type: Number
    },
    eventType: {
        type: String,
        enum: ['THRESHOLD', 'OFFSET', 'SENSOR_ERROR', 'ABNORMAL_DATA', 'OTHER'],
        default: 'OTHER'
    },
    details: {
        type: mongoose.Schema.Types.Mixed
    }
});

export default mongoose.model('Alert', AlertSchema);