import crypto from 'crypto';
import { getRazorpay, isRazorpayConfigured, toPaise, toRupees } from './razorpayClient.js';

/** Constant-time HMAC-SHA256 check, shared by checkout callbacks and webhooks. */
export const hmacMatches = (payload, signature, secret) => {
    if (!signature || !secret) return false;
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(payload).digest('hex'));
    const provided = Buffer.from(String(signature));
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
};

/**
 * Razorpay Payment Verification
 *
 * The client is never trusted to report whether a payment succeeded. Every
 * online payment must clear these checks before anything is marked Paid:
 *
 *   1. SIGNATURE — proves the payment genuinely came from Razorpay for this
 *                  checkout and was not forged.
 *   2. OWNERSHIP — Razorpay's own record says the payment belongs to this order.
 *   3. CAPTURE   — an "authorized" payment is captured now; Razorpay refunds
 *                  uncaptured payments automatically after a few days, which would
 *                  otherwise leave a "Paid" order with no money behind it.
 *   4. AMOUNT    — the captured amount equals what the server calculated.
 *
 * Returns { ok: true, paymentId, amountPaid } or { ok: false, reason }.
 */
export const verifyRazorpayPayment = async ({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    expectedAmount
}) => {
    if (!isRazorpayConfigured()) {
        return { ok: false, reason: 'Payment gateway is not configured on the server' };
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return { ok: false, reason: 'Payment confirmation is incomplete' };
    }

    if (!hmacMatches(`${razorpay_order_id}|${razorpay_payment_id}`, razorpay_signature, process.env.RAZORPAY_KEY_SECRET)) {
        return { ok: false, reason: 'Invalid payment signature' };
    }

    try {
        const razorpay = getRazorpay();
        let payment = await razorpay.payments.fetch(razorpay_payment_id);

        if (payment.order_id !== razorpay_order_id) {
            return { ok: false, reason: 'Payment does not belong to this checkout' };
        }

        if (payment.status === 'authorized') {
            payment = await razorpay.payments.capture(razorpay_payment_id, payment.amount, payment.currency || 'INR');
        }

        if (payment.status !== 'captured') {
            return { ok: false, reason: `Payment was not completed (status: ${payment.status})` };
        }

        // Compared in paise: the checkout is opened for the exact server amount.
        if (expectedAmount !== undefined && Math.abs(Number(payment.amount) - toPaise(expectedAmount)) > 100) {
            return {
                ok: false,
                captured: true,
                paymentId: razorpay_payment_id,
                amountPaid: toRupees(payment.amount),
                reason: `Amount paid (₹${toRupees(payment.amount)}) does not match the amount due (₹${expectedAmount})`
            };
        }

        return { ok: true, paymentId: razorpay_payment_id, amountPaid: toRupees(payment.amount) };
    } catch (error) {
        console.error('❌ [PAYMENT_VERIFY] Could not confirm payment with Razorpay:', error?.error?.description || error.message);
        return { ok: false, reason: 'Could not confirm this payment with the gateway' };
    }
};
