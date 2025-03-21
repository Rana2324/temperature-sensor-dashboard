import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
    sensorId: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    changeType: {
        type: String,
        required: true
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    }
});

export default mongoose.model('Settings', SettingsSchema);