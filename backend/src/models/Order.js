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
            gstPercent: { type: Number, default: null },
            sacCode: { type: String, default: '' },
            serviceType: { type: String, default: '' },
            unit: { type: String, default: 'pc' },
            weight: { type: Number, default: null },
            clothCount: { type: Number, default: 0 },
            photos: [{ type: String }]
        }
    ],
    // Best available weight in kg (null = unknown); see utils/orderWeight.js
    totalWeight: {
        type: Number,
        default: null
    },
    weightSource: {
        type: String,
        enum: ['weighed', 'customer', 'estimated', null],
        default: null
    },
    // Kept for backwards compatibility with historical orders. New customer orders
    // always use estimatedWeight from the admin-configured Master Service weights.
    customerWeight: { type: Number, default: null },
    weighedWeight: { type: Number, default: null },    // measured by the vendor
    weighedAt: { type: Date, default: null },
    estimatedWeight: { type: Number, default: null },  // admin-configured service weights × quantities
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
    // Immutable order-time geography used by admin analytics. Historical orders
    // without this snapshot fall back to the customer's current saved address.
    analyticsLocation: {
        state: { type: String, default: '' },
        city: { type: String, default: '' },
        pincode: { type: String, default: '' },
        geofence: { type: String, default: '' }
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
    // Walk-in orders with rider delivery: the vendor's verified delivery-fee payment.
    logisticsPayment: {
        razorpayOrderId: { type: String, default: null },
        razorpayPaymentId: { type: String, default: null },
        amount: { type: Number, default: 0 },
        status: { type: String, enum: ['NOT_APPLICABLE', 'PAID', 'REFUNDED'], default: 'NOT_APPLICABLE' }
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
     checkoutDiscountAmount: { type: Number },
    discountAmount: {
        type: Number,
        default: 0
    },
    walletAmountDeducted: {
        type: Number,
        default: 0
    },
    // Persist the money that was actually returned. `totalAmount` can include
    // COD/unpaid portions, discounts and other non-refundable components, so
    // it must not be used as the refund value in finance analytics.
    refundAmount: {
        type: Number,
        default: 0
    },
    onlineRefundAmount: {
        type: Number,
        default: 0
    },
    walletRefundAmount: {
        type: Number,
        default: 0
    },
    refundedAt: {
        type: Date,
        default: null
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
        businessName: String,
        businessAddress: String,
        address: { type: String, default: '' },
        gstNumber: { type: String, default: null },
        isExUser: { type: Boolean, default: false }
    },
    vendorSnapshot: {
        displayName: { type: String, default: null },
        shopName: { type: String, default: null },
        phone: { type: String, default: null },
        email: { type: String, default: null },
        gstNumber: { type: String, default: null },
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
        gstAmount: { type: Number, default: 0 },
        feeGstPercent: { type: Number }
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
    isCustomerRD: {
        type: Boolean,
        default: false
    },
    gstSnapshot: {
        scenario: { type: String, enum: ['RD_RD', 'URD_RD', 'URD_URD'], default: undefined },
        customerRegistered: { type: Boolean, default: false },
        customerGstin: { type: String, default: '' },
        vendorRegistered: { type: Boolean, default: false },
        vendorGstin: { type: String, default: '' },
        spinzytGstin: { type: String, default: '' },
        gstPercent: { type: Number, default: 0 },
        platformFeeGstPercent: { type: Number, default: 0 },
        logisticsFeeGstPercent: { type: Number, default: 0 },
        customerName: { type: String, default: '' },
        customerAddress: { type: String, default: '' },
        customerCity: { type: String, default: '' },
        customerState: { type: String, default: '' },
        customerStateCode: { type: String, default: '' },
        customerPincode: { type: String, default: '' },
        vendorName: { type: String, default: '' },
        vendorAddress: { type: String, default: '' },
        vendorCity: { type: String, default: '' },
        vendorState: { type: String, default: '' },
        vendorStateCode: { type: String, default: '' },
        vendorPincode: { type: String, default: '' },
        capturedAt: { type: Date, default: null }
    },
    invoices: {
        customerInvoice: {
            invoiceNo: { type: String, default: '' },
            documentStatus: { type: String, enum: ['DRAFT', 'FINALIZED'], default: 'DRAFT' },
            financialYear: { type: String, default: '' },
            invoiceDate: { type: Date, default: null },
            preparedAt: { type: Date, default: null },
            finalizedAt: { type: Date, default: null },
            scenario: { type: String, enum: ['A', 'B', 'C', ''], default: '' },
            gstScenario: { type: String, enum: ['RD_RD', 'URD_RD', 'URD_URD', ''], default: '' },
            issuerName: { type: String, default: '' },
            supplierGstin: { type: String, default: '' },
            recipientGstin: { type: String, default: '' },
            supplierAddress: { type: String, default: '' },
            supplierStateCode: { type: String, default: '' },
            recipientAddress: { type: String, default: '' },
            recipientStateCode: { type: String, default: '' },
            placeOfSupplyStateCode: { type: String, default: '' },
            reverseCharge: { type: Boolean, default: false },
            currency: { type: String, default: 'INR' },
            discountAmount: { type: Number, default: 0 },
            cgstAmount: { type: Number, default: 0 },
            sgstAmount: { type: Number, default: 0 },
            igstAmount: { type: Number, default: 0 },
            lineItems: [{
                description: String, sacCode: String, quantity: Number, unit: String,
                unitPrice: Number, taxableValue: Number, gstRate: Number,
                cgstRate: Number, cgstAmount: Number, sgstRate: Number,
                sgstAmount: Number, igstRate: Number, igstAmount: Number,
                totalAmount: Number
            }],
            serviceValue: { type: Number, default: 0 },
            taxPercent: { type: Number, default: 0 },
            taxAmount: { type: Number, default: 0 },
            displayGstinLabel: { type: String, default: '' },
            displayGstinNo: { type: String, default: '' },
            customerWalletCredit: { type: Number, default: 0 },
            totalAmount: { type: Number, default: 0 },
            generatedAt: { type: Date, default: null }
        },
        platformInvoice: {
            invoiceNo: { type: String, default: '' },
            documentStatus: { type: String, enum: ['DRAFT', 'FINALIZED'], default: 'DRAFT' },
            financialYear: { type: String, default: '' },
            invoiceDate: { type: Date, default: null },
            preparedAt: { type: Date, default: null },
            finalizedAt: { type: Date, default: null },
            issuerName: { type: String, default: '' },
            recipientName: { type: String, default: '' },
            recipientGstin: { type: String, default: '' },
            supplierAddress: { type: String, default: '' },
            supplierStateCode: { type: String, default: '' },
            recipientAddress: { type: String, default: '' },
            recipientStateCode: { type: String, default: '' },
            placeOfSupplyStateCode: { type: String, default: '' },
            reverseCharge: { type: Boolean, default: false },
            currency: { type: String, default: 'INR' },
            cgstAmount: { type: Number, default: 0 },
            sgstAmount: { type: Number, default: 0 },
            igstAmount: { type: Number, default: 0 },
            lineItems: [{
                description: String, sacCode: String, quantity: Number, unit: String,
                unitPrice: Number, taxableValue: Number, gstRate: Number,
                cgstRate: Number, cgstAmount: Number, sgstRate: Number,
                sgstAmount: Number, igstRate: Number, igstAmount: Number,
                totalAmount: Number
            }],
            platformFee: { type: Number, default: 0 },
            platformFeeTaxPercent: { type: Number, default: 18 },
            platformFeeTax: { type: Number, default: 0 },
            logisticsFee: { type: Number, default: 0 },
            logisticsFeeTaxPercent: { type: Number, default: 18 },
            logisticsFeeTax: { type: Number, default: 0 },
            spinzytGstin: { type: String, default: '' },
            spinzytPromoShare: { type: Number, default: 0 },
            totalInvoiceAmount: { type: Number, default: 0 },
            generatedAt: { type: Date, default: null }
        }
    },
    ledger: {
        vendorNetPayout: { type: Number, default: 0 },
        customerWalletCredit: { type: Number, default: 0 },
        platformFee: { type: Number, default: 0 },
        spinzytCombinedRevenue: { type: Number, default: 0 },
        appliedPromoValue: { type: Number, default: 0 },
        promoOwnerType: { type: String, enum: ['PLATFORM', 'VENDOR', 'NONE'], default: 'NONE' },
        invoice1Total: { type: Number, default: 0 },
        invoice2Total: { type: Number, default: 0 },
        spinzytPromoShare: { type: Number, default: 0 }
    },
    vendorSettlement: {
        status: { type: String, enum: ['NOT_ROUTED', 'BLOCKED', 'PENDING', 'RETRY', 'TRANSFERRED'], default: 'NOT_ROUTED' },
        account: { type: String, default: '' }, amount: { type: Number, default: 0 },
        key: { type: String, default: '' }, transferId: { type: String, default: '' },
        error: { type: String, default: '' }, updatedAt: Date
    },
    vendorPromotion: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion', default: null },
    walletCreditStatus: { type: String, enum: ['NOT_APPLICABLE', 'PENDING', 'CREDITED', 'REVERSED'], default: 'NOT_APPLICABLE' },
    walletCreditedAt: { type: Date, default: null },
    invoiceFinalizationStatus: { type: String, enum: ['NOT_READY', 'FINALIZING', 'FINALIZED'], default: 'NOT_READY' },
    invoiceFinalizationStartedAt: { type: Date, default: null },
    statusHistory: [
        {
            status: { type: String, required: true },
            timestamp: { type: Date, default: Date.now }
        }
    ]
    ,
    acceptedAt: { type: Date, default: null },
    processingStartedAt: { type: Date, default: null },
    readyForDispatchAt: { type: Date, default: null },
    dispatchedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null }
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
orderSchema.index({ isCustomerRD: 1, status: 1 });  // GST pool visibility
orderSchema.index(
    { 'invoices.customerInvoice.invoiceNo': 1 },
    { unique: true, partialFilterExpression: { 'invoices.customerInvoice.invoiceNo': { $type: 'string', $gt: '' } } }
);
orderSchema.index(
    { 'invoices.platformInvoice.invoiceNo': 1 },
    { unique: true, partialFilterExpression: { 'invoices.platformInvoice.invoiceNo': { $type: 'string', $gt: '' } } }
);
// A Razorpay payment can pay for at most one order.
orderSchema.index({ razorpayPaymentId: 1 }, { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } });
orderSchema.index({ 'logisticsPayment.razorpayPaymentId': 1 }, { unique: true, partialFilterExpression: { 'logisticsPayment.razorpayPaymentId': { $type: 'string' } } });

// Pre-save hook to generate unique readable order ID and track status history
orderSchema.pre('validate', function(next) {
    if (!this.isNew && this.invoiceFinalizationStatus === 'FINALIZED' && this.isModified('invoices')) {
        return next(new Error('Finalized invoices are immutable'));
    }
    if (this.isModified('status') && this.status === 'DELIVERED'
        && this.invoiceFinalizationStatus !== 'FINALIZED') {
        return next(new Error('Orders can only be delivered through invoice finalization'));
    }
    next();
});

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
        const statusTime = new Date();
        if (!this.statusHistory) {
            this.statusHistory = [];
        }
        this.statusHistory.push({
            status: this.status,
            timestamp: statusTime
        });
        if (this.status !== 'ORDER_PLACED' && !this.acceptedAt) this.acceptedAt = statusTime;
        if (this.status === 'PROCESSING' && !this.processingStartedAt) this.processingStartedAt = statusTime;
        if (this.status === 'READY_FOR_DISPATCH' && !this.readyForDispatchAt) this.readyForDispatchAt = statusTime;
        if (this.status === 'OUT_FOR_DELIVERY' && !this.dispatchedAt) this.dispatchedAt = statusTime;
        if (this.status === 'DELIVERED' && !this.deliveredAt) this.deliveredAt = statusTime;
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);

export default Order;
