import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
    sensorId: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    alertReason: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'recovered'],
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    versionKey: false
});

export default mongoose.model('Alert', alertSchema, 'alerts_log');