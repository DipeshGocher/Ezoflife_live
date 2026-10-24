import PaymentTransaction from '../models/PaymentTransaction.js';
import { getRazorpay, toPaise, toRupees } from '../utils/razorpayClient.js';
import { refundPayment, refundUnusedPayment } from './paymentLedger.js';
import { confirmPlatformFeeOrders } from '../controllers/b2bOrderController.js';

/**
 * Keeps the PaymentTransaction ledger in step with what Razorpay actually holds,
 * for the cases the checkout callback never reports (browser closed, network
 * dropped, app crashed after paying). Driven by the Razorpay webhook and by the
 * periodic reconciler, so it works even if the webhook is not configured.
 */

// A captured payment not used by an order within this window is returned.
export const ORPHAN_REFUND_AFTER_MS = 30 * 60 * 1000;
// Unpaid checkouts are checked against Razorpay after this long, and expired after a day.
const CHECK_CREATED_AFTER_MS = 15 * 60 * 1000;
const EXPIRE_CREATED_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Record a captured payment for a checkout.
 * - wrong amount            -> refunded
 * - B2B platform fee        -> the vendor's supply orders are confirmed
 * - customer / walk-in      -> marked "paid"; the order is created by the app's
 *                              callback, or the reconciler refunds it later
 */
export const syncCapturedPayment = async (txn, payment) => {
    if (!txn || !payment) return null;
    if (['consumed', 'refunded'].includes(txn.status)) return txn;

    let current = payment;
    if (current.status === 'authorized') {
        current = await getRazorpay().payments.capture(current.id, current.amount, current.currency || 'INR');
    }
    if (current.status !== 'captured') return txn;

    const marked = await PaymentTransaction.findOneAndUpdate(
        { _id: txn._id, status: { $in: ['created', 'paid', 'failed', 'expired'] } },
        { status: 'paid', razorpayPaymentId: current.id, amountPaid: toRupees(current.amount) },
        { new: true }
    );
    if (!marked) return PaymentTransaction.findById(txn._id);

    if (Math.abs(Number(current.amount) - toPaise(marked.amount)) > 100) {
        return refundPayment(marked, 'Amount paid did not match the amount due');
    }
    if (marked.purpose === 'B2B_PLATFORM_FEE') {
        await confirmPlatformFeeOrders(marked.razorpayOrderId, current.id);
        return PaymentTransaction.findById(marked._id);
    }
    return marked;
};

/** One reconciliation pass. Returns counts, for logs and tests. */
export const runPaymentReconciliation = async ({ now = new Date() } = {}) => {
    const summary = { checked: 0, captured: 0, refunded: 0, expired: 0, errors: 0 };
    let razorpay;
    try {
        razorpay = getRazorpay();
    } catch {
        return summary; // gateway not configured: nothing to reconcile against
    }

    // 1. Checkouts still "created": ask Razorpay whether they were actually paid.
    const pending = await PaymentTransaction.find({
        status: 'created',
        createdAt: { $lte: new Date(now - CHECK_CREATED_AFTER_MS) }
    }).limit(200);
    for (const txn of pending) {
        summary.checked += 1;
        try {
            const { items = [] } = await razorpay.orders.fetchPayments(txn.razorpayOrderId);
            const paid = items.find(p => p.status === 'captured') || items.find(p => p.status === 'authorized');
            if (paid) {
                const result = await syncCapturedPayment(txn, paid);
                if (result?.status === 'refunded') summary.refunded += 1;
                else summary.captured += 1;
            } else if (now - txn.createdAt > EXPIRE_CREATED_AFTER_MS) {
                await PaymentTransaction.updateOne({ _id: txn._id, status: 'created' }, { status: 'expired' });
                summary.expired += 1;
            }
        } catch (error) {
            summary.errors += 1;
            console.error(`❌ [RECONCILE] ${txn.razorpayOrderId}:`, error?.error?.description || error.message);
        }
    }

    // 2. Captured but never used for an order: the customer/vendor was charged for
    //    nothing (e.g. the app closed after paying). Return the money.
    const orphans = await PaymentTransaction.find({
        status: 'paid',
        purpose: { $in: ['CUSTOMER_ORDER', 'WALKIN_DELIVERY'] },
        updatedAt: { $lte: new Date(now - ORPHAN_REFUND_AFTER_MS) }
    }).limit(200);
    for (const txn of orphans) {
        try {
            if (await refundUnusedPayment(txn._id, 'Payment was not used for an order')) summary.refunded += 1;
        } catch (error) {
            summary.errors += 1;
            console.error(`❌ [RECONCILE] refund ${txn.razorpayPaymentId}:`, error?.error?.description || error.message);
        }
    }

    // 3. B2B fee payments marked paid but whose orders are still pending.
    const unconfirmedFees = await PaymentTransaction.find({ status: 'paid', purpose: 'B2B_PLATFORM_FEE' }).limit(200);
    for (const txn of unconfirmedFees) {
        try {
            await confirmPlatformFeeOrders(txn.razorpayOrderId, txn.razorpayPaymentId);
            summary.captured += 1;
        } catch (error) {
            summary.errors += 1;
        }
    }

    return summary;
};
