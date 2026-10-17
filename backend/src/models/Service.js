import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true
    },
    subCategory: {
        type: String,
        default: ''
    },
    basePrice: {
        type: Number,
        required: true
    },
    unit: {
        type: String,
        required: true,
        default: 'kg'
    },
    tier: {
        type: String,
        enum: ['Essential', 'Heritage'],
        default: 'Essential'
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive', 'Suspended', 'Pending Approval'],
        default: 'Active'
    },
    vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    isMaster: {
        type: Boolean,
        default: true
    },
    approvalStatus: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Approved' // Master services are approved by default
    },
    adminMessage: {
        type: String,
        default: ''
    },
    image: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    sacCode: { type: String, default: '9994' },
    gst: { type: Number, min: 0, max: 100, default: undefined },
    heritageGst: { type: Number, min: 0, max: 100, default: undefined },
    normalTime: {
        type: String,
        default: ''
    },
    expressTime: {
        type: String,
        default: ''
    },
    tags: {
        type: [String],
        default: []
    },
    completionTime: {
        type: Number,
        default: 1
    },
    serviceType: {
        type: String,
        enum: ['individual', 'retail'],
        default: 'individual'
    }
}, { timestamps: true });

const Service = mongoose.model('Service', serviceSchema);

export default Service;
