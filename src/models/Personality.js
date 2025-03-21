import mongoose from 'mongoose';

const personalitySchema = new mongoose.Schema({
    sensorId: {
        type: String,
        required: true
    },
    biasType: {
        type: String,
        required: true
    },
    biasValue: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('Personality', personalitySchema);