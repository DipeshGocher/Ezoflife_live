import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    operationId: { type: String, required: true, immutable: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true, index: true },
    method: { type: String, required: true, immutable: true },
    path: { type: String, required: true, immutable: true },
    targetId: { type: String, default: '', immutable: true, index: true },
    outcome: { type: String, enum: ['Requested', 'Succeeded', 'Denied', 'Failed', 'Aborted'], required: true, immutable: true },
    statusCode: { type: Number, immutable: true },
    before: { type: mongoose.Schema.Types.Mixed, immutable: true },
    after: { type: mongoose.Schema.Types.Mixed, immutable: true },
    createdAt: { type: Date, default: Date.now, immutable: true }
}, { versionKey: false });
schema.index({ createdAt: -1, _id: -1 });
schema.pre('save', function () { if (!this.isNew) throw new Error('Audit events are append-only'); });
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'bulkWrite']) {
    schema.pre(operation, function () { throw new Error('Audit events are append-only'); });
}
export default mongoose.model('AdminAuditEvent', schema);
