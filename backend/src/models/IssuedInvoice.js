import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
    type: { type: String, enum: ['customer', 'platform_vendor'], required: true, immutable: true },
    number: { type: String, required: true, unique: true, immutable: true },
    issuedAt: { type: Date, required: true, immutable: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    templateVersion: { type: String, required: true, immutable: true },
    settings: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
    facts: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true }
}, { timestamps: false });
schema.index({ order: 1, type: 1 }, { unique: true });
const reject = () => { throw new Error('Issued invoices are immutable. Issue a separately referenced correction document.'); };
schema.pre('save', function () { if (!this.isNew) reject(); });
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) schema.pre(operation, reject);
schema.pre('deleteOne', { document: true, query: false }, reject);
schema.pre('bulkWrite', reject);
export default mongoose.model('IssuedInvoice', schema);
