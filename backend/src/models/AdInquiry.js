import mongoose from 'mongoose';

const adInquirySchema = new mongoose.Schema({
    // Signed-in user who submitted it (null for anonymous submissions)
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    brandName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    location: {
        type: String,
        required: true
    },
    budget: {
        type: Number,
        required: true
    },
    timeline: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: [
            'Creative Pending Review',
            'Content Review',
            'Invoice Generated',
            'Scheduled',
            'Running',
            'Campaign Ended',
            'Paused by Admin',
            'Rejected'
        ],
        default: 'Creative Pending Review'
    },
    notes: {
        type: String,
        default: ''
    },
    submittedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

const AdInquiry = mongoose.model('AdInquiry', adInquirySchema);
export default AdInquiry;
