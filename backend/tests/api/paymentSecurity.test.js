/**
 * Payment security — the highest-value regression suite in the project.
 *
 * Before this was fixed, a client could place an order with
 * `paymentStatus: "Paid"` and the server believed it, producing free orders.
 * Every test here is an attack that must fail.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { orderPayload, createUser } from '../helpers/factories.js';

let env, customerId, customerToken;

before(async () => {
    // Fixed dummy gateway keys so the signature check always runs, whether or
    // not the machine has a backend/.env (CI and fresh clones do not).
    env = await startTestEnvironment({
        env: { RAZORPAY_KEY_ID: 'rzp_test_dummy', RAZORPAY_KEY_SECRET: 'dummy_secret_for_tests' }
    });
    const user = await createUser(api, env.baseUrl, '9990000001', 'Customer');
    customerId = user.id;
    customerToken = user.token;
    assert.ok(customerId, 'test customer must exist');
}, { timeout: 90000 });

after(async () => { if (env) await env.stop(); });

const placeOrder = (overrides) =>
    api(env.baseUrl, '/api/orders', {
        method: 'POST', body: orderPayload(customerId, overrides), token: customerToken
    });

describe('an order can never be marked Paid without a verified payment', () => {
    test('rejects a claimed Paid status with no payment evidence at all', async () => {
        const res = await placeOrder({ paymentStatus: 'Paid', paymentMethod: 'Online' });
        assert.equal(res.status, 400);
        assert.match(res.body.message, /could not be verified/i);
    });

    test('rejects an online order carrying only a payment id', async () => {
        const res = await placeOrder({
            paymentMethod: 'Online', razorpayPaymentId: 'pay_FORGED'
        });
        assert.equal(res.status, 400);
    });

    test('rejects a forged signature', async () => {
        const res = await placeOrder({
            paymentMethod: 'Online',
            razorpayOrderId: 'order_FAKE',
            razorpayPaymentId: 'pay_FAKE',
            razorpaySignature: 'deadbeefdeadbeef'
        });
        assert.equal(res.status, 400);
        assert.match(res.body.message, /signature/i);
    });

    test('no Paid order is persisted by any rejected attempt', async () => {
        await placeOrder({ paymentStatus: 'Paid', paymentMethod: 'Online' });
        const list = await api(env.baseUrl, `/api/orders/my?customerId=${customerId}`);
        const orders = Array.isArray(list.body) ? list.body : (list.body?.orders || []);
        const bogus = orders.filter(o => o.paymentStatus === 'Paid' && o.paymentMethod === 'Online');
        assert.equal(bogus.length, 0, 'a forged payment created a Paid order');
    });
});

describe('the client cannot dictate payment state', () => {
    test('a COD order is Pending even when the client claims Paid', async () => {
        const res = await placeOrder({ paymentMethod: 'COD', paymentStatus: 'Paid' });
        assert.equal(res.status, 201, `expected creation, got ${res.status}`);
        assert.equal(res.body.paymentStatus, 'Pending');
        assert.equal(res.body.paymentMethod, 'COD');
    });

    test('a rejected payment does not consume the customer wallet balance', async () => {
        const before = await api(env.baseUrl, `/api/auth/me/${customerId}`);
        const balanceBefore = before.body?.walletBalance ?? before.body?.user?.walletBalance ?? 0;

        await placeOrder({ paymentMethod: 'Online', useWallet: true, razorpayPaymentId: 'pay_X' });

        const after = await api(env.baseUrl, `/api/auth/me/${customerId}`);
        const balanceAfter = after.body?.walletBalance ?? after.body?.user?.walletBalance ?? 0;
        assert.equal(balanceAfter, balanceBefore, 'wallet was debited despite payment failure');
    });
});

describe('server-side pricing is authoritative', () => {
    test('the stored total ignores a client-supplied totalAmount', async () => {
        const res = await placeOrder({ totalAmount: 1, paymentMethod: 'COD' });
        assert.equal(res.status, 201);
        // Server recomputes from items (2 x 100) plus fees and GST.
        assert.ok(res.body.totalAmount > 1, `server trusted the client total: ${res.body.totalAmount}`);
    });

    test('an unbacked discount claim cannot reduce the payable amount', async () => {
        const res = await placeOrder({
            paymentMethod: 'COD', discountAmount: 99999, promoApplied: null
        });
        assert.equal(res.status, 201);
        // With no valid promotion attached, the discount must be discarded.
        assert.equal(res.body.discountAmount, 0);
    });
});
