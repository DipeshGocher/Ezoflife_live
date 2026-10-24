import PaymentTransaction from '../models/PaymentTransaction.js';
import { hmacMatches } from '../utils/paymentVerification.js';
import { syncCapturedPayment, runPaymentReconciliation } from '../services/paymentSync.js';

/**
 * POST /api/payments/razorpay/webhook
 *
 * Configure in the Razorpay Dashboard → Settings → Webhooks with the events
 * payment.authorized, payment.captured, payment.failed, order.paid and
 * refund.processed, and put the same secret in RAZORPAY_WEBHOOK_SECRET.
 *
 * The signature is checked against the raw request body; nothing in an
 * unsigned request is trusted. Non-2xx responses make Razorpay retry.
 */
export const handleRazorpayWebhook = async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) return res.status(400).json({ message: 'Missing webhook signature' });
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ message: 'Webhook secret is not configured' });

    if (!req.rawBody || !hmacMatches(req.rawBody, signature, secret)) {
        return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    const { event, payload } = req.body || {};
    const payment = payload?.payment?.entity;
    const refund = payload?.refund?.entity;

    try {
        if (['payment.authorized', 'payment.captured', 'order.paid'].includes(event) && payment?.order_id) {
            const txn = await PaymentTransaction.findOne({ razorpayOrderId: payment.order_id });
            if (txn) await syncCapturedPayment(txn, payment);
        } else if (event === 'payment.failed' && payment?.order_id) {
            await PaymentTransaction.updateOne(
                { razorpayOrderId: payment.order_id, status: 'created' },
                { status: 'failed', failureReason: payment.error_description || payment.error_reason || 'Payment failed' }
            );
        } else if (event?.startsWith('refund.') && refund?.payment_id && refund.status !== 'failed') {
            await PaymentTransaction.updateOne(
                { razorpayPaymentId: refund.payment_id },
                { status: 'refunded', refundId: refund.id, refundedAt: new Date() }
            );
        }
        res.json({ ok: true });
    } catch (error) {
        console.error(`❌ [RAZORPAY_WEBHOOK] ${event}:`, error?.error?.description || error.message);
        res.status(500).json({ message: 'Webhook processing failed' });
    }
};

/** POST /api/admin/payments/reconcile — run a reconciliation pass now. */
export const reconcilePaymentsNow = async (req, res) => {
    try {
        res.json(await runPaymentReconciliation());
    } catch (error) {
        console.error('❌ [RECONCILE]', error.message);
        res.status(500).json({ message: 'Reconciliation failed' });
    }
};
