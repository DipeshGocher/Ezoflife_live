/**
 * Razorpay payments, end to end against a fake gateway (tests/helpers/fakeRazorpay.js).
 *
 * Guarantees covered:
 *   - the server, not the app, decides every amount Razorpay collects
 *   - a payment pays for exactly one thing (no replay, no use by another account)
 *   - money is refunded automatically when an order can't be placed for it
 *   - walk-in rider delivery requires a verified payment of the server's fee
 *   - B2B platform fees are confirmed by the callback, the webhook or the reconciler
 *   - webhooks are only trusted with a valid signature
 *   - bank verification comes from RazorpayX, never from the user
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestEnvironment, api, FIXTURE_SERVICE_ID } from '../helpers/testEnvironment.js';
import { createUser, orderPayload, tokenFor } from '../helpers/factories.js';
import { startFakeRazorpay, signWebhook } from '../helpers/fakeRazorpay.js';

let env, gateway, customer, otherCustomer, vendor, supplier, PaymentTransaction, Order, B2BOrder, MasterService;
const admin = { token: tokenFor('Admin') };

before(async () => {
    gateway = await startFakeRazorpay();
    env = await startTestEnvironment({ env: gateway.env });
    customer = await createUser(api, env.baseUrl, '9990009101', 'Customer');
    otherCustomer = await createUser(api, env.baseUrl, '9990009102', 'Customer');
    vendor = await createUser(api, env.baseUrl, '9990009103', 'Vendor');
    supplier = await createUser(api, env.baseUrl, '9990009104', 'Supplier');
    await mongoose.connect(env.mongoUri);
    PaymentTransaction = (await import('../../src/models/PaymentTransaction.js')).default;
    Order = (await import('../../src/models/Order.js')).default;
    B2BOrder = (await import('../../src/models/B2BOrder.js')).default;
    MasterService = (await import('../../src/models/MasterService.js')).default;
}, { timeout: 90000 });

after(async () => {
    await mongoose.disconnect().catch(() => {});
    if (env) await env.stop();
    if (gateway) await gateway.stop();
});

// 2 × ₹100 fixture service at 5% GST, no service area or fee configs: ₹210.
const cart = (overrides = {}) => ({
    items: [{ serviceId: FIXTURE_SERVICE_ID, quantity: 2 }],
    pickupLocation: { lat: 22.7196, lng: 75.8577 },
    deliveryMode: 'Normal',
    selectedTier: 'Essential',
    ...overrides
});
const openCheckout = (token, order = cart(), extra = {}) =>
    api(env.baseUrl, '/api/orders/razorpay', { method: 'POST', token, body: { purpose: 'CUSTOMER_ORDER', order, ...extra } });
const placeOnline = (token, proof, overrides = {}) =>
    api(env.baseUrl, '/api/orders', {
        method: 'POST',
        token,
        body: orderPayload(undefined, {
            ...cart(),
            paymentMethod: 'Online',
            razorpayOrderId: proof.razorpay_order_id,
            razorpayPaymentId: proof.razorpay_payment_id,
            razorpaySignature: proof.razorpay_signature,
            ...overrides
        })
    });

describe('customer orders: the server sets the amount', () => {
    test('fractional fees collect and store the same amount down to paise', async () => {
        const configs = mongoose.connection.collection('systemconfigs');
        await configs.insertOne({ key: 'normal_logistics_fee', value: 1 });
        try {
            const checkout = await openCheckout(customer.token);
            assert.equal(checkout.status, 200);
            assert.equal(checkout.body.payable, 211.18);
            assert.equal(gateway.orders.get(checkout.body.id).amount, 21118);
            const proof = gateway.pay(checkout.body.id);
            const placed = await placeOnline(customer.token, proof);
            assert.equal(placed.status, 201, JSON.stringify(placed.body));
            assert.equal(placed.body.totalAmount, 211.18);
            assert.equal(placed.body.priceBreakdown.gstAmount, 10.18);
            assert.equal(placed.body.priceBreakdown.feeGstPercent, 18);
        } finally {
            await configs.deleteOne({ key: 'normal_logistics_fee' });
        }
    });

    test('quote and checkout use database prices, not the app\'s', async () => {
        const quote = await api(env.baseUrl, '/api/orders/quote', { method: 'POST', token: customer.token, body: cart() });
        assert.equal(quote.status, 200);
        assert.equal(quote.body.payableOnline, 210);

        // A tampered price/amount in the request changes nothing.
        const tampered = cart({ items: [{ serviceId: FIXTURE_SERVICE_ID, quantity: 2, price: 1 }] });
        const res = await openCheckout(customer.token, tampered, { amount: 1 });
        assert.equal(res.status, 200);
        assert.equal(res.body.payable, 210);
        assert.equal(gateway.orders.get(res.body.id).amount, 21000, 'Razorpay is asked for ₹210 in paise');
    });

    test('unknown services and junk quantities are rejected', async () => {
        const bad = await openCheckout(customer.token, cart({ items: [{ serviceId: new mongoose.Types.ObjectId().toString(), quantity: 1 }] }));
        assert.equal(bad.status, 400);
        const junk = await openCheckout(customer.token, cart({ items: [{ serviceId: FIXTURE_SERVICE_ID, quantity: -3 }] }));
        assert.equal(junk.status, 400);
    });

    test('purpose is required', async () => {
        const res = await api(env.baseUrl, '/api/orders/razorpay', { method: 'POST', token: customer.token, body: { amount: 500 } });
        assert.equal(res.status, 400);
    });

    test('COD orders store server prices too', async () => {
        const res = await api(env.baseUrl, '/api/orders', {
            method: 'POST',
            token: customer.token,
            body: orderPayload(undefined, { ...cart(), items: [{ serviceId: FIXTURE_SERVICE_ID, quantity: 2, price: 1 }], deliveryCharge: 0, platformMultiplier: -1 })
        });
        assert.equal(res.status, 201);
        assert.equal(res.body.items[0].price, 100);
        assert.equal(res.body.totalAmount, 210);
        assert.equal(res.body.paymentStatus, 'Pending');
    });
});

describe('customer orders: a payment pays for exactly one order', () => {
    let proof;

    test('a verified payment places a Paid order and is consumed', async () => {
        const checkout = await openCheckout(customer.token);
        proof = gateway.pay(checkout.body.id);
        const res = await placeOnline(customer.token, proof);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.paymentStatus, 'Paid');
        assert.equal(res.body.razorpayPaymentId, proof.razorpay_payment_id);
        const txn = await PaymentTransaction.findOne({ razorpayOrderId: checkout.body.id }).lean();
        assert.equal(txn.status, 'consumed');
        assert.equal(String(txn.consumedBy.ids[0]), res.body._id);
    });

    test('replaying the same payment for a second order is refused', async () => {
        const before = await Order.countDocuments();
        const res = await placeOnline(customer.token, proof);
        assert.equal(res.status, 409);
        assert.match(res.body.message, /already been used/i);
        assert.equal(await Order.countDocuments(), before);
    });

    test("another account cannot use someone else's payment", async () => {
        const checkout = await openCheckout(customer.token);
        const stolen = gateway.pay(checkout.body.id);
        const res = await placeOnline(otherCustomer.token, stolen);
        assert.equal(res.status, 403);
    });

    test('a forged signature is rejected', async () => {
        const checkout = await openCheckout(customer.token);
        const real = gateway.pay(checkout.body.id);
        const res = await placeOnline(customer.token, { ...real, razorpay_signature: 'f'.repeat(64) });
        assert.equal(res.status, 400);
        assert.match(res.body.message, /signature/i);
    });

    test('an authorized-only payment is captured before the order is accepted', async () => {
        const checkout = await openCheckout(customer.token);
        const authorized = gateway.pay(checkout.body.id, { status: 'authorized' });
        const res = await placeOnline(customer.token, authorized);
        assert.equal(res.status, 201);
        assert.equal(gateway.payments.get(authorized.razorpay_payment_id).status, 'captured');
    });
});

describe('customer orders: automatic refunds', () => {
    test('if the price changes after paying, the payment is refunded instead of accepted', async () => {
        const svc = await MasterService.create({ itemName: 'Price Change', categoryId: new mongoose.Types.ObjectId(), basePrice: 50, discountedPrice: 50, gst: 0, isActive: true });
        const order = cart({ items: [{ serviceId: svc._id.toString(), quantity: 1 }] });
        const checkout = await openCheckout(customer.token, order);
        assert.equal(checkout.body.payable, 50);
        const proof = gateway.pay(checkout.body.id);

        await MasterService.updateOne({ _id: svc._id }, { basePrice: 80, discountedPrice: 80 });
        const refundsBefore = gateway.refunds.length;
        const res = await placeOnline(customer.token, proof, { items: order.items });
        assert.equal(res.status, 409);
        assert.equal(res.body.refunded, true);
        assert.equal(gateway.refunds.length, refundsBefore + 1);
        assert.equal(gateway.refunds.at(-1).payment_id, proof.razorpay_payment_id);
        assert.equal((await PaymentTransaction.findOne({ razorpayOrderId: checkout.body.id })).status, 'refunded');
    });

    test('a payment for the wrong amount is refunded', async () => {
        const checkout = await openCheckout(customer.token);
        const short = gateway.pay(checkout.body.id, { amount: 100 }); // ₹1 instead of ₹210
        const refundsBefore = gateway.refunds.length;
        const res = await placeOnline(customer.token, short);
        assert.equal(res.status, 400);
        assert.equal(gateway.refunds.length, refundsBefore + 1);
    });

    test('a paid checkout that never became an order is refunded by the reconciler', async () => {
        const checkout = await openCheckout(customer.token);
        gateway.pay(checkout.body.id);
        // The app closed after paying; time passes.
        await PaymentTransaction.collection.updateOne(
            { razorpayOrderId: checkout.body.id },
            { $set: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } }
        );
        const first = await api(env.baseUrl, '/api/admin/payments/reconcile', { method: 'POST', token: admin.token });
        assert.equal(first.status, 200);
        assert.equal((await PaymentTransaction.findOne({ razorpayOrderId: checkout.body.id })).status, 'paid');

        await PaymentTransaction.collection.updateOne(
            { razorpayOrderId: checkout.body.id },
            { $set: { updatedAt: new Date(Date.now() - 40 * 60 * 1000) } }
        );
        const refundsBefore = gateway.refunds.length;
        await api(env.baseUrl, '/api/admin/payments/reconcile', { method: 'POST', token: admin.token });
        assert.equal((await PaymentTransaction.findOne({ razorpayOrderId: checkout.body.id })).status, 'refunded');
        assert.equal(gateway.refunds.length, refundsBefore + 1);
    });

    test('reconciliation is admin-only', async () => {
        const res = await api(env.baseUrl, '/api/admin/payments/reconcile', { method: 'POST', token: customer.token });
        assert.equal(res.status, 403);
    });
});

describe('walk-in rider delivery must be paid', () => {
    const walkIn = (extra = {}) => api(env.baseUrl, '/api/orders/walk-in', {
        method: 'POST',
        token: vendor.token,
        body: {
            customerPhone: '9990009199', customerName: 'Walk In',
            items: [{ serviceId: FIXTURE_SERVICE_ID, title: 'Wash & Fold', price: 100, quantity: 1 }],
            totalAmount: 105, weight: 2, riderDropOff: true, deliveryMode: 'Normal',
            dropAddress: '1 Test Rd', addressDetails: { street: '1 Test Rd', lat: 22.7, lng: 75.8 },
            deliveryCharge: 1, // ignored
            ...extra
        }
    });

    test('the delivery fee comes from the server', async () => {
        const res = await api(env.baseUrl, '/api/orders/walk-in/delivery-fee?deliveryMode=Normal', { token: vendor.token });
        assert.equal(res.status, 200);
        assert.equal(res.body.fee, 50, 'no logistics config: the ₹50 minimum');
        const denied = await api(env.baseUrl, '/api/orders/walk-in/delivery-fee', { token: customer.token });
        assert.equal(denied.status, 403);
    });

    test('rider delivery without payment is refused and nothing is created', async () => {
        const before = await Order.countDocuments({ orderType: 'Walk-In' });
        const res = await walkIn();
        assert.equal(res.status, 402);
        assert.equal(await Order.countDocuments({ orderType: 'Walk-In' }), before);
    });

    test('a verified payment of the server fee creates the order with the paid fee', async () => {
        const checkout = await api(env.baseUrl, '/api/orders/razorpay', {
            method: 'POST', token: vendor.token, body: { purpose: 'WALKIN_DELIVERY', deliveryMode: 'Normal', amount: 1 }
        });
        assert.equal(checkout.status, 200);
        assert.equal(checkout.body.payable, 50);
        const proof = gateway.pay(checkout.body.id);
        const res = await walkIn({ logisticsPayment: proof });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.deliveryCharge, 50);
        assert.equal(res.body.logisticsPayment.status, 'PAID');
        assert.equal(res.body.logisticsPayment.razorpayPaymentId, proof.razorpay_payment_id);

        const replay = await walkIn({ logisticsPayment: proof });
        assert.equal(replay.status, 409, 'the same fee payment cannot cover a second delivery');
    });

    test('store pickup needs no payment', async () => {
        const res = await walkIn({ riderDropOff: false });
        assert.equal(res.status, 201);
        assert.equal(res.body.deliveryCharge, 0);
    });
});

describe('B2B platform fee: callback, webhook and reconciler stay in sync', () => {
    let product;
    before(async () => {
        const VendorMasterSupply = (await import('../../src/models/VendorMasterSupply.js')).default;
        product = await VendorMasterSupply.create({
            skuId: 'SKU-RZP-1', categoryId: new mongoose.Types.ObjectId(), materialName: 'Fee Soap', quantity: '1 kg',
            wholesaleRate: 100, gst: 18, supplierId: 'SUP-9104', serialNumber: 1, isActive: 'y', approvalStatus: 'Approved'
        });
        const config = await api(env.baseUrl, '/api/b2b-orders/admin/platform-fee-config', {
            method: 'PUT', token: admin.token, body: { enabled: true, type: 'FLAT', value: 40, minFee: 0, maxFee: null }
        });
        assert.equal(config.status, 200, JSON.stringify(config.body));
    });

    const place = () => api(env.baseUrl, '/api/b2b-orders/place', {
        method: 'POST', token: vendor.token,
        body: { vendorId: vendor.id, items: [{ materialId: product._id.toString(), name: 'Fee Soap', quantity: 2, price: 1 }], pincode: '452001', city: 'Indore', shippingAddress: '1 Test Rd' }
    });

    test('the checkout callback confirms the orders', async () => {
        const placed = await place();
        assert.equal(placed.status, 201, JSON.stringify(placed.body));
        assert.equal(placed.body.platformFeeAmount, 40);
        assert.equal(placed.body.razorpayKeyId, gateway.env.RAZORPAY_KEY_ID);
        const proof = gateway.pay(placed.body.razorpayOrderId);
        const res = await api(env.baseUrl, '/api/b2b-orders/verify-platform-fee', { method: 'POST', token: vendor.token, body: proof });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.ok(res.body.orders.every(o => o.status === 'SUBMITTED' && o.platformFeeStatus === 'PAID'));
        assert.equal((await PaymentTransaction.findOne({ razorpayOrderId: placed.body.razorpayOrderId })).status, 'consumed');
    });

    test('if the browser never reports back, the signed webhook confirms them', async () => {
        const placed = await place();
        const proof = gateway.pay(placed.body.razorpayOrderId);
        const payment = gateway.payments.get(proof.razorpay_payment_id);
        const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payment } } });

        const forged = await fetch(`${env.baseUrl}/api/payments/razorpay/webhook`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'bad' }, body: raw
        });
        assert.equal(forged.status, 400);
        assert.equal((await B2BOrder.findOne({ razorpayOrderId: placed.body.razorpayOrderId })).status, 'PENDING_PAYMENT');

        const signed = await fetch(`${env.baseUrl}/api/payments/razorpay/webhook`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signWebhook(raw) }, body: raw
        });
        assert.equal(signed.status, 200);
        const orders = await B2BOrder.find({ razorpayOrderId: placed.body.razorpayOrderId }).lean();
        assert.ok(orders.every(o => o.status === 'SUBMITTED' && o.platformFeePaymentId === payment.id));

        // A late callback is still a success and changes nothing.
        const late = await api(env.baseUrl, '/api/b2b-orders/verify-platform-fee', { method: 'POST', token: vendor.token, body: proof });
        assert.equal(late.status, 200);
    });

    test('without callback or webhook, the reconciler confirms them', async () => {
        const placed = await place();
        gateway.pay(placed.body.razorpayOrderId);
        await PaymentTransaction.collection.updateOne(
            { razorpayOrderId: placed.body.razorpayOrderId },
            { $set: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } }
        );
        await api(env.baseUrl, '/api/admin/payments/reconcile', { method: 'POST', token: admin.token });
        const orders = await B2BOrder.find({ razorpayOrderId: placed.body.razorpayOrderId }).lean();
        assert.ok(orders.every(o => o.status === 'SUBMITTED'));
    });

    test('the old in-app escrow payment endpoints are gone', async () => {
        for (const path of ['/api/b2b-orders/initiate-payment', '/api/b2b-orders/verify-payment']) {
            const res = await api(env.baseUrl, path, { method: 'POST', token: vendor.token, body: {} });
            assert.equal(res.status, 404, path);
        }
    });
});

describe('bank verification comes from RazorpayX', () => {
    const initiate = (token, body) => api(env.baseUrl, '/api/supplier/initiate-bank-verify', { method: 'POST', token, body });
    const complete = (token, body = {}) => api(env.baseUrl, '/api/supplier/complete-bank-verify', { method: 'POST', token, body });

    test('a valid account is verified with the bank\'s registered name; no amount is ever revealed', async () => {
        const res = await initiate(supplier.token, { accountNumber: '123456789012', ifscCode: 'HDFC0001234', userId: customer.id });
        assert.equal(res.status, 200);
        assert.equal(res.body.status, 'pending');
        assert.ok(!('demoAmount' in res.body) && !/₹1\.\d\d/.test(res.body.message || ''), 'no secret amount in the response');

        const done = await complete(supplier.token, { amountEntered: '1.00' });
        assert.equal(done.status, 200);
        assert.equal(done.body.status, 'verified');
        assert.equal(done.body.registeredName, 'TEST ACCOUNT HOLDER');

        const User = (await import('../../src/models/User.js')).default;
        const [verified, untouched] = await Promise.all([User.findById(supplier.id).lean(), User.findById(customer.id).lean()]);
        assert.equal(verified.bankVerification.isVerified, true);
        assert.equal(verified.bankVerification.accountLast4, '9012');
        assert.notEqual(untouched.bankVerification?.isVerified, true, 'a body userId cannot verify someone else');
    });

    test('an invalid account is reported as failed', async () => {
        await initiate(vendor.token, { accountNumber: '111111000000', ifscCode: 'HDFC0001234' });
        const done = await complete(vendor.token);
        assert.equal(done.status, 400);
        assert.equal(done.body.status, 'failed');
    });

    test('malformed details are rejected before calling RazorpayX', async () => {
        const res = await initiate(supplier.token, { accountNumber: '12', ifscCode: 'BAD' });
        assert.equal(res.status, 400);
    });
});
