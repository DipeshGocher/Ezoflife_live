import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    adjustment: { type: Number, required: true, min: -5, max: 5 },
    startsAt: { type: Date, required: true }, expiresAt: { type: Date, required: true },
    reason: { type: String, required: true, maxlength: 1000 },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    revision: { type: Number, default: 1 },
    history: [{ adjustment: Number, startsAt: Date, expiresAt: Date, reason: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }]
}, { timestamps: true });
export default mongoose.model('VendorRank', schema);
