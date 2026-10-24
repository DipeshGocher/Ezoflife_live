import mongoose from 'mongoose';

/**
 * One row per Razorpay checkout the server opens. It is the source of truth that
 * keeps the app and Razorpay in sync:
 *
 *   created   — Razorpay order opened for a server-calculated amount
 *   paid      — Razorpay confirmed a captured payment, not yet used for anything
 *   consumed  — the payment has been applied to exactly one order (cannot be reused)
 *   refunded  — the money went back to the payer (e.g. the order could not be placed)
 *   failed    — the payer's attempt failed
 *   expired   — opened but never paid
 *
 * A payment can only move created/paid -> consumed once, atomically, which is
 * what stops one payment being replayed to pay for several orders.
 */
const paymentTransactionSchema = new mongoose.Schema({
    purpose: {
        type: String,
        enum: ['CUSTOMER_ORDER', 'WALKIN_DELIVERY', 'B2B_PLATFORM_FEE'],
        required: true
    },
    payer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },          // rupees, calculated by the server
    currency: { type: String, default: 'INR' },
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String, default: null },
    status: {
        type: String,
        enum: ['created', 'paid', 'consumed', 'refunded', 'failed', 'expired'],
        default: 'created'
    },
    amountPaid: { type: Number, default: null },
    consumedBy: {
        kind: { type: String, enum: ['Order', 'B2BOrder', null], default: null },
        ids: [{ type: mongoose.Schema.Types.ObjectId }]
    },
    consumedAt: { type: Date, default: null },
    refundId: { type: String, default: null },
    refundedAt: { type: Date, default: null },
    failureReason: { type: String, default: '' },
    // What the amount was calculated from, for support and audits.
    quote: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });

paymentTransactionSchema.index(
    { razorpayPaymentId: 1 },
    { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } }
);
paymentTransactionSchema.index({ status: 1, createdAt: 1 });

const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);

export default PaymentTransaction;
