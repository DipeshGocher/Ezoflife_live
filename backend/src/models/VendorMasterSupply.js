import mongoose from 'mongoose';

const vendorMasterSupplySchema = new mongoose.Schema({
    skuId: {
        type: String,
        unique: true,
        required: true
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VendorSupplyCategory',
        required: true
    },
    hsnCode: {
        type: String,
        trim: true,
        default: '-'
    },
    gst: {
        type: Number,
        default: 18
    },
    brand: {
        type: String,
        trim: true,
        default: 'Generic'
    },
    materialName: {
        type: String,
        required: true,
        trim: true
    },
    quantity: {
        type: String, // e.g. "10 Litres", "5 Kg", "100 Pcs"
        required: true,
        trim: true,
        default: '-'
    },
    wholesaleRate: {
        type: Number,
        required: true,
        default: 0
    },
    // Supplier-private unit cost used for profit analytics. Never exposed in the
    // vendor live catalog.
    costPrice: {
        type: Number,
        default: 0,
        min: 0,
        select: false
    },
    bulkDiscount: {
        type: Number, // Percentage discount, e.g. 5 for 5%
        default: 0
    },
    bulkThreshold: {
        type: Number, // Minimum quantity for bulk discount, e.g. 50 units
        default: 0
    },
    isActive: {
        type: String,
        enum: ['y', 'n'],
        default: 'y'
    },
    approvalStatus: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    adminMessage: {
        type: String,
        default: ''
    },
    deliveryFrequency: {
        type: String,
        trim: true,
        default: '-'
    },
    movFreeDelivery: {
        type: Number,
        default: 0
    },
    supplierId: {
        type: String,
        trim: true,
        default: '-'
    },
    supplierFacilityName: {
        type: String,
        trim: true,
        default: '-'
    },
    serialNumber: {
        type: Number,
        required: true
    },
    images: [{
        type: String
    }],
    description: {
        type: String,
        default: ''
    }
}, { timestamps: true });

const VendorMasterSupply = mongoose.model('VendorMasterSupply', vendorMasterSupplySchema);

export default VendorMasterSupply;
