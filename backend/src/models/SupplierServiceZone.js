import mongoose from 'mongoose';

const supplierServiceZoneSchema = new mongoose.Schema({
    zoneId: {
        type: String,
        unique: true,
        required: true
    },
    supplierId: {
        type: String,
        required: true,
        trim: true,
        default: 'SUP-001'
    },
    zoneName: {
        type: String,
        required: true,
        trim: true
    },
    pincodes: {
        type: [String],
        default: [],
        required: true
    },
    deliveryCharges: {
        type: Number,
        default: 0
    },
    minOrderValue: {
        type: Number,
        default: 0
    },
    // Legacy field; no longer used to charge a fee. See platformFeeMode.
    supplierPlatformMultiplier: {
        type: Number,
        default: 0
    },
    // DEFAULT = inherit the global B2B platform fee (SystemConfig b2b_platform_fee).
    platformFeeMode: {
        type: String,
        enum: ['DEFAULT', 'PERCENTAGE', 'FLAT', 'WAIVED'],
        default: 'DEFAULT'
    },
    // Percent of goods value for PERCENTAGE, rupees per order for FLAT.
    platformFeeValue: {
        type: Number,
        default: 0,
        min: 0
    },
    minSupplierPlatformFee: {
        type: Number,
        default: 0
    },
    maxSupplierPlatformFee: {
        type: Number,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

const SupplierServiceZone = mongoose.model('SupplierServiceZone', supplierServiceZoneSchema);

export default SupplierServiceZone;
