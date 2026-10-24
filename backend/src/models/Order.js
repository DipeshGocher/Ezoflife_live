import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        default: null
    },
    vendor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    rider: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    items: [
        {
            serviceId: { type: String, required: true },
            name: { type: String, required: true },
            quantity: { type: Number, required: true },
            price: { type: Number, required: true },
            unit: { type: String, default: 'pc' },
            clothCount: { type: Number, default: 0 },
            photos: [{ type: String }]
        }
    ],
    status: {
        type: String,
        enum: [
            'ORDER_PLACED', 
            'PICKUP_ASSIGNED', 
            'RIDER_ARRIVING', 
            'IN_TRANSIT', 
            'RECEIVED_BY_VENDOR', 
            'PROCESSING', 
            'READY_FOR_DISPATCH', 
            'OUT_FOR_DELIVERY', 
            'DELIVERED', 
            'CANCELLED'
        ],
        default: 'ORDER_PLACED'
    },
    pickupSlot: {
        date: { type: String },
        time: { type: String }
    },
    deliverySlot: {
        date: { type: String },
        time: { type: String }
    },
    pickupAddress: {
        type: String,
        required: true
    },
    pickupLocation: {
        lat: { type: Number },
        lng: { type: Number }
    },
    dropAddress: {
        type: String,
        required: true
    },
    dropLocation: {
        lat: { type: Number },
        lng: { type: Number }
    },
    totalAmount: {
        type: Number,
        required: true
    },
    advanceAmount: {
        type: Number,
        default: 0
    },
    dueAmount: {
        type: Number,
        default: 0
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Refunded'],
        default: 'Pending'
    },
    paymentMethod: {
        type: String,
        default: 'COD'
    },
    razorpayPaymentId: {
        type: String,
        default: null
    },
    razorpayOrderId: {
        type: String,
        default: null
    },
    orderId: {
        type: String,
        unique: true
    },
    specialInstructions: {
        type: String,
        default: ''
    },
    nearbyRiders: [
        {
            id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            distance: String,
            name: String
        }
    ],
    pickupOtp: {
        type: String,
        default: null
    },
    deliveryOtp: {
        type: String,
        default: null
    },
    promoApplied: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Promotion',
        default: null
    },
     discountAmount: {
        type: Number,
        default: 0
    },
    walletAmountDeducted: {
        type: Number,
        default: 0
    },
    deliveryMode: {
        type: String,
        enum: ['Normal', 'Express'],
        default: 'Normal'
    },
    tier: {
        type: String,
        enum: ['Essential', 'Heritage'],
        default: 'Essential'
    },
    deliveryCharge: {
        type: Number,
        default: 0
    },
    shipmentDetails: {
        // taskId is the provider-agnostic booking handle and the idempotency
        // key: once set, this leg has been dispatched and must not be re-booked.
        taskId: String,
        shipmentId: String,
        orderId: String, // Shiprocket's internal order ID
        awbCode: String,
        courierName: String,
        labelUrl: String,
        isQC: { type: Boolean, default: false },
        lastStatus: String,
        pickupTokenNumber: String
    },
    deliveryShipmentDetails: {
        taskId: String,
        shipmentId: String,
        orderId: String,
        awbCode: String,
        courierName: String,
        labelUrl: String,
        lastStatus: String,
        pickupTokenNumber: String
    },
    logisticsHandshakes: [
        {
            phase: { 
                type: String, 
                enum: ['Collection', 'Inbound', 'Fulfillment', 'Reverse', 'Completion'],
                required: true
            },
            otp: String,
            isVerified: { type: Boolean, default: false },
            verifiedAt: Date,
            initiator: { type: String }, // Who has the OTP (e.g., 'Rider')
            verifier: { type: String }   // Who enters the OTP (e.g., 'Customer', 'Vendor')
        }
    ],
    riderDetails: {
        name: String,
        phone: String,
        photo: String
    },
    customerSnapshot: {
        displayName: { type: String, default: null },
        phone: { type: String, default: null },
        email: { type: String, default: null },
        customerType: { type: String, default: null },
        isExUser: { type: Boolean, default: false }
    },
    vendorSnapshot: {
        displayName: { type: String, default: null },
        shopName: { type: String, default: null },
        phone: { type: String, default: null },
        email: { type: String, default: null },
        isExUser: { type: Boolean, default: false }
    },
    riderSnapshot: {
        displayName: { type: String, default: null },
        phone: { type: String, default: null },
        isExUser: { type: Boolean, default: false }
    },
    priceBreakdown: {
        baseWithArea: { type: Number, default: 0 },
        expressSurcharge: { type: Number, default: 0 },
        platformFee: { type: Number, default: 0 },
        logisticsFee: { type: Number, default: 0 },
        gstAmount: { type: Number, default: 0 }
    },
    customerPhotos: [{ type: String }],
    pickupStatus: {
        type: String,
        enum: ['none', 'scheduled', 'requested', 'picked', 'failed', 'rescheduled'],
        default: 'none'
    },
    pickupExpectedDate: Date,
    pickupTriggerTime: Date,
    deliveryTriggerTime: Date,
    deliveryStatus: {
        type: String,
        enum: ['none', 'scheduled', 'requested', 'delivered', 'failed'],
        default: 'none'
    },
    serviceTime: { type: Number, default: 0 },
    fallbackEnabled: { type: Boolean, default: false },
    orderType: {
        type: String,
        enum: ['Normal', 'Walk-In'],
        default: 'Normal'
    },
    riderDropOff: {
        type: Boolean,
        default: false
    },
    allocation_status: {
        type: String,
        enum: ['NONE', 'PROMO_EXCLUSIVE', 'GENERAL_POOL'],
        default: 'NONE'
    },
    allocation_expires_at: {
        type: Date,
        default: null
    },
    pricingPolicySnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    ledger: {
        vendorNetPayout: { type: Number, default: 0 },
        customerWalletCredit: { type: Number, default: 0 },
        platformFee: { type: Number, default: 0 },
        spinzytCombinedRevenue: { type: Number, default: 0 },
        appliedPromoValue: { type: Number, default: 0 },
        promoOwnerType: { type: String, enum: ['PLATFORM', 'VENDOR', 'NONE'], default: 'NONE' }
    },
    statusHistory: [
        {
            status: { type: String, required: true },
            timestamp: { type: Date, default: Date.now }
        }
    ]
}, { timestamps: true });

/**
 * Indexes for the queries this collection actually serves.
 *
 * Without these every lookup is a full collection scan: at 1,500 orders a
 * customer's order list already took ~16x longer than on an empty collection,
 * and that cost grows linearly with the table.
 */
orderSchema.index({ customer: 1, createdAt: -1 });  // customer order history
orderSchema.index({ vendor: 1, status: 1 });        // vendor dashboard tabs
orderSchema.index({ status: 1, createdAt: -1 });    // admin lists / pool queries
orderSchema.index({ paymentStatus: 1 });            // settlement + payout reporting
orderSchema.index({ createdAt: -1 });               // dashboards and date ranges

// Pre-save hook to generate unique readable order ID and track status history
orderSchema.pre('save', async function(next) {
    if (!this.orderId) {
        // Drawn from an atomic counter rather than Math.random(). The previous
        // scheme picked from only 9000 values against a unique index, so
        // collisions began almost immediately (birthday paradox: ~50% by ~112
        // orders) and became total once all 9000 were used.
        const prefix = this.orderType === 'Walk-In' ? 'WL' : 'ON';
        const { nextSequence } = await import('./Counter.js');
        this.orderId = `#${prefix}-${await nextSequence(`order:${prefix}`)}`;
    }

    if (this.isNew || this.isModified('status')) {
        if (!this.statusHistory) {
            this.statusHistory = [];
        }
        this.statusHistory.push({
            status: this.status,
            timestamp: new Date()
        });
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);

export default Order;
