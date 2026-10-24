import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    rule: { type: String, required: true },
    startedAt: { type: Date, required: true }, dueAt: { type: Date, required: true },
    firstSeenAt: { type: Date, required: true }, lastSeenAt: { type: Date, required: true },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acknowledgedAt: Date, acknowledgment: String,
    resolvedAt: { type: Date, default: null }
}, { timestamps: true });
schema.index({ order: 1, resolvedAt: 1 });
export default mongoose.model('OperationalAlert', schema);
