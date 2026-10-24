import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    phone: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    role: {
        type: String,
        enum: ['Customer', 'Vendor', 'Rider', 'Admin', 'Supplier'],
        default: 'Customer'
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'revision_required'],
        default: function() {
            if (!this) return 'approved';
            return this.role === 'Vendor' ? 'pending' : 'approved';
        }
    },
    isBlocked: { type: Boolean, default: false },
    rejectionReason: {
        type: String,
        default: ''
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        default: ''
    },
    password: {
        type: String,
        default: ''
    },
    customerType: { 
        type: String, 
        enum: ['individual', 'retail'], 
        default: 'individual' 
    },
    address: {
        type: String,
        default: ''
    },
    addresses: [{
        type: { type: String, enum: ['Home', 'Office', 'Other'], default: 'Home' },
        address: { type: String, required: true },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        pincode: { type: String, default: '' },
        location: {
            lat: { type: Number, default: 0 },
            lng: { type: Number, default: 0 }
        },
        isDefault: { type: Boolean, default: false }
    }],
    shopDetails: {
        name: { type: String, default: '' },
        address: { type: String, default: '' },
        pincode: { type: String, default: '' },
        city: { type: String, default: '' },
        gst: { type: String, default: '' },
        services: [{
            id: { type: String },
            name: { type: String },
            adminRate: { type: Number },
            vendorRate: { type: Number },
            normalTime: { type: String, default: '' },
            expressTime: { type: String, default: '' },
            icon: { type: String },
            active: { type: Boolean, default: true },
            status: { 
                type: String, 
                enum: ['pending', 'approved', 'rejected', 'offered'],
                default: 'pending'
            },
            rejectionReason: { type: String, default: '' }
        }]
    },
    location: {
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 }
    },
    riderDetails: {
        address: { type: String, default: '' },
        vehicleModel: { type: String, default: '' },
        plateNumber: { type: String, default: '' }
    },
    supplierDetails: {
        businessName: { type: String, default: '' },
        address: { type: String, default: '' },
        city: { type: String, default: '' },
        pincode: { type: String, default: '' },
        gst: { type: String, default: '' },
        supplyCategories: [{ type: String }],
        entityType: { type: String, default: '' },
        designation: { type: String, default: '' },
        panNumber: { type: String, default: '' },
        aadhaarNumber: { type: String, default: '' }
    },
    documents: [
        {
            type: { type: String },
            url: { type: String }
        }
    ],
    bankDetails: {
        accountHolderName: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        ifscCode: { type: String, default: '' },
        bankName: { type: String, default: '' }
    },
    bankVerification: {
        amount: { type: Number, default: 0 },
        isVerified: { type: Boolean, default: false },
        lastRequested: { type: Date }
    },
    isVerifiedSupplier: { type: Boolean, default: false },
    successfulDeliveries: { type: Number, default: 0 },
    isProfileComplete: {
        type: Boolean,
        default: false
    },
    displayName: {
        type: String,
        default: ''
    },
    otp: {
        type: String,
        default: null
    },
    otpExpiry: {
        type: Date,
        default: null
    },
    // Vendor Onboarding Expanded Fields (Phase 2)
    ownerName: { type: String, default: '' },
    businessName: { type: String, default: '' },
    businessType: { type: String, default: '' },
    facilityName: { type: String, default: '' },
    panNumber: { type: String, default: '' },
    aadharNumber: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    businessAddress: { type: String, default: '' },
    facilityAddress: { type: String, default: '' },
    
    // Facility Media
    exteriorPhoto: { type: String, default: '' },
    interiorPhotos: [{ type: String }],
    walkthroughVideo: { type: String, default: '' },
    
    // Legal Document URLs
    panDoc: { type: String, default: '' },
    gstDoc: { type: String, default: '' },
    aadharDoc: { type: String, default: '' },
    msmeDoc: { type: String, default: '' },
    franchiseDoc: { type: String, default: '' },
    chequeDoc: { type: String, default: '' },
    
    // Onboarding Metadata
    onboardingStage: { type: String, default: 'NONE' },
    tier: { type: String, enum: ['Economy', 'Standard', 'Gold'], default: 'Standard' },

    isOnline: { type: Boolean, default: false },
    fcmToken: { type: String, default: '' },
    image: { type: String, default: '' },

    // DRAFT CART FOR PERSISTENCE
    draftCart: {
        selectedQuantities: { type: Map, of: Number, default: {} },
        selectedTier: { type: String, default: null },
        isExpress: { type: Boolean, default: false },
        pickup: {
            date: { type: String, default: '' },
            time: { type: String, default: '' },
            address: { type: Object, default: null }
        },
        delivery: {
            date: { type: String, default: '' },
            time: { type: String, default: '' },
            address: { type: Object, default: null }
        },
        orderNotes: { type: String, default: '' },
        itemPhotos: { type: Map, of: [String], default: {} }
    },
    rejectionFlags: [String],
    walletBalance: {
        type: Number,
        default: 0
    },
    upiId: {
        type: String,
        default: ''
    },
    /**
     * Saved payment methods.
     *
     * DELIBERATELY stores no full card number, CVV or expiry-with-PAN — only the
     * display remnants needed to render a saved-method list. Storing real card
     * data would put this system in PCI-DSS scope; use Razorpay tokenisation if
     * true saved-card charging is ever required.
     */
    paymentMethods: [{
        type: { type: String, enum: ['card', 'upi'], required: true },
        brand: { type: String, default: '' },      // visa / google_pay / …
        last4: { type: String, default: '' },      // display only
        expiry: { type: String, default: '' },     // MM/YY, display only
        holder: { type: String, default: '' },
        handle: { type: String, default: '' },     // UPI VPA
        isDefault: { type: Boolean, default: false }
    }],
    cardName: {
        type: String,
        default: ''
    },
    adminRole: { type: String, default: null },
    adminPermissions: [{ type: String }],
    adminAccessType: { type: String, default: 'Read/Write' },
    geofenceRestrictions: [{ type: String }],
    activationToken: { type: String, default: null }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

export default User;
