import PaymentTransaction from '../models/PaymentTransaction.js';
import { getRazorpay, toPaise, toRupees } from '../utils/razorpayClient.js';
import { verifyRazorpayPayment, hmacMatches } from '../utils/paymentVerification.js';

/**
 * Every Razorpay checkout in the app goes through this module:
 *
 *   openCheckout   — server calculates the amount, opens the Razorpay order and
 *                    records a PaymentTransaction
 *   claimPayment   — verifies the payment and marks it consumed, atomically, so a
 *                    payment can pay for exactly one thing
 *   refundPayment  — sends the money back (order could not be placed, price
 *                    changed, orphaned payment found by the reconciler)
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export class PaymentError extends Error {
    constructor(message, status = 400, extra = {}) {
        super(message);
        this.status = status;
        Object.assign(this, extra);
    }
}

export const openCheckout = async ({ purpose, payerId, amount, quote = null, notes = {} }) => {
    const rupees = round2(amount);
    if (!(rupees >= 1)) throw new PaymentError('Nothing to pay online for this request', 400);

    const razorpay = getRazorpay();
    const rzpOrder = await razorpay.orders.create({
        amount: toPaise(rupees),
        currency: 'INR',
        receipt: `${purpose.toLowerCase()}_${Date.now()}`.slice(0, 40),
        notes: { purpose, payer: String(payerId), ...notes }
    });

    await PaymentTransaction.create({
        purpose,
        payer: payerId,
        amount: rupees,
        currency: rzpOrder.currency || 'INR',
        razorpayOrderId: rzpOrder.id,
        quote
    });

    return {
        id: rzpOrder.id,
        razorpayOrderId: rzpOrder.id,
        amount: rzpOrder.amount,          // paise, as Razorpay Checkout expects
        amountRupees: rupees,
        currency: rzpOrder.currency || 'INR',
        keyId: process.env.RAZORPAY_KEY_ID
    };
};

/** Return money for a captured payment and record it on the transaction. */
export const refundPayment = async (txn, reason) => {
    if (!txn?.razorpayPaymentId) return null;
    if (txn.status === 'refunded') return txn;
    const razorpay = getRazorpay();
    const amount = txn.amountPaid ?? txn.amount;
    const refund = await razorpay.payments.refund(txn.razorpayPaymentId, {
        amount: toPaise(amount),
        notes: { reason: String(reason || 'Refund').slice(0, 250) }
    });
    return PaymentTransaction.findByIdAndUpdate(
        txn._id,
        { status: 'refunded', refundId: refund.id, refundedAt: new Date(), failureReason: reason || '' },
        { new: true }
    );
};

/**
 * Refund a captured payment that was never used, claiming it atomically first so
 * it can't be refunded while an order is being placed with it at the same time.
 * Returns the updated transaction, or null if it was used/refunded meanwhile.
 */
export const refundUnusedPayment = async (txnId, reason) => {
    const claimed = await PaymentTransaction.findOneAndUpdate(
        { _id: txnId, status: 'paid' },
        { status: 'refunded', failureReason: `Refund in progress: ${reason}` },
        { new: true }
    );
    if (!claimed) return null;
    try {
        const refund = await getRazorpay().payments.refund(claimed.razorpayPaymentId, {
            amount: toPaise(claimed.amountPaid ?? claimed.amount),
            notes: { reason: String(reason).slice(0, 250) }
        });
        return PaymentTransaction.findByIdAndUpdate(
            claimed._id,
            { refundId: refund.id, refundedAt: new Date(), failureReason: reason },
            { new: true }
        );
    } catch (error) {
        await PaymentTransaction.updateOne({ _id: claimed._id }, { status: 'paid', failureReason: `Refund failed: ${reason}` });
        throw error;
    }
};

/**
 * Verify a checkout callback and consume the payment for one purpose.
 * Throws PaymentError (with an HTTP status) when the payment cannot be used.
 *
 * @param expectedAmount  the amount the server calculates *now*; if it no longer
 *                        matches what was charged (prices changed between opening
 *                        the checkout and placing the order) the payment is
 *                        refunded instead of being accepted for the wrong amount.
 */
export const claimPayment = async ({
    purpose, payerId, razorpay_order_id, razorpay_payment_id, razorpay_signature, expectedAmount
}) => {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw new PaymentError('Payment could not be verified. Payment confirmation is incomplete', 400);
    }
    // Cheap check first: a forged callback is rejected before touching the ledger.
    if (process.env.RAZORPAY_KEY_SECRET
        && !hmacMatches(`${razorpay_order_id}|${razorpay_payment_id}`, razorpay_signature, process.env.RAZORPAY_KEY_SECRET)) {
        throw new PaymentError('Payment could not be verified. Invalid payment signature', 400);
    }

    const txn = await PaymentTransaction.findOne({ razorpayOrderId: razorpay_order_id });
    if (!txn) throw new PaymentError('Unknown payment checkout. Start the payment again.', 400);
    if (txn.purpose !== purpose) throw new PaymentError('This payment was made for something else', 400);
    if (String(txn.payer) !== String(payerId)) throw new PaymentError('This payment belongs to another account', 403);
    if (txn.status === 'consumed') throw new PaymentError('This payment has already been used', 409);
    if (txn.status === 'refunded') throw new PaymentError('This payment was refunded', 409);

    const verification = await verifyRazorpayPayment({
        razorpay_order_id, razorpay_payment_id, razorpay_signature, expectedAmount: txn.amount
    });
    if (!verification.ok) {
        // Money was taken but for the wrong amount: return it.
        if (verification.captured) {
            const marked = await PaymentTransaction.findOneAndUpdate(
                { _id: txn._id, status: { $in: ['created', 'paid'] } },
                { status: 'paid', razorpayPaymentId: razorpay_payment_id, amountPaid: verification.amountPaid },
                { new: true }
            );
            if (marked) await refundPayment(marked, verification.reason).catch(() => {});
        }
        throw new PaymentError(`Payment could not be verified. ${verification.reason}`, 400);
    }

    // Prices changed since the checkout was opened: refund rather than accept.
    if (expectedAmount !== undefined && Math.abs(round2(expectedAmount) - txn.amount) > 1) {
        const marked = await PaymentTransaction.findOneAndUpdate(
            { _id: txn._id, status: { $in: ['created', 'paid'] } },
            { status: 'paid', razorpayPaymentId: verification.paymentId, amountPaid: verification.amountPaid },
            { new: true }
        );
        if (marked) await refundPayment(marked, 'Amount due changed before the order was placed').catch(() => {});
        throw new PaymentError(
            `The amount due changed from ₹${txn.amount} to ₹${round2(expectedAmount)}. Your payment has been refunded; please try again.`,
            409,
            { refunded: true }
        );
    }

    // The single atomic step that makes a payment usable only once.
    const consumed = await PaymentTransaction.findOneAndUpdate(
        { _id: txn._id, status: { $in: ['created', 'paid'] } },
        {
            status: 'consumed',
            consumedAt: new Date(),
            razorpayPaymentId: verification.paymentId,
            amountPaid: verification.amountPaid
        },
        { new: true }
    );
    if (!consumed) throw new PaymentError('This payment has already been used', 409);
    return consumed;
};

/** Link a consumed payment to what it paid for. */
export const linkPayment = (txn, kind, ids) =>
    PaymentTransaction.updateOne({ _id: txn._id }, { 'consumedBy.kind': kind, 'consumedBy.ids': ids });

/**
 * The payment was consumed but what it paid for could not be saved: refund it so
 * the customer is never charged for an order that does not exist.
 */
export const refundConsumed = async (txn, reason) => {
    try {
        await refundPayment(txn, reason);
    } catch (error) {
        console.error(`❌ [PAYMENT] Refund failed for ${txn.razorpayPaymentId}:`, error?.error?.description || error.message);
        await PaymentTransaction.updateOne({ _id: txn._id }, { status: 'paid', failureReason: `Refund pending: ${reason}` });
    }
};

export { toRupees };
