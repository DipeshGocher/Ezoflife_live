/**
 * B2B platform fee: vendor ordering supplies from suppliers.
 *
 * Verifies that:
 * 1. The first-run default is a ₹40 flat fee; admins can explicitly disable it.
 * 2. A client-supplied totalPlatformFee is ignored in both directions.
 * 3. The fee is computed server-side from DB wholesale rates, per supplier, and
 *    honours the global default, zone overrides, min/max and bulk discounts.
 * 4. Only admins can read/change the fee settings; bad settings are rejected.
 * 5. A fee-due order is never persisted when the gateway can't take payment.
 * 6. Fee verification only confirms the caller's own orders and fails closed.
 * 7. The admin vendor-order table exposes the platform fee.
 *
 * The server runs with Razorpay keys blanked so nothing here talks to the gateway.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { createUser, tokenFor } from '../helpers/factories.js';

let env, admin, vendor, otherVendor;
let VendorMasterSupply, B2BOrder;
const supplies = {};

const SUP_A = 'SUP-7001';
const SUP_B = 'SUP-7002';
const VENDOR_PIN = '452001';

before(async () => {
    env = await startTestEnvironment({ env: { RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' } });
    admin = { token: tokenFor('Admin') };
    vendor = await createUser(api, env.baseUrl, '9990007101', 'Vendor');
    otherVendor = await createUser(api, env.baseUrl, '9990007102', 'Vendor');
    // Suppliers are matched to supplierId by the last 4 digits of their phone.
    await createUser(api, env.baseUrl, '9990007001', 'Supplier');
    await createUser(api, env.baseUrl, '9990007002', 'Supplier');
    assert.ok(vendor.token && otherVendor.token, 'vendor fixtures must exist');

    await mongoose.connect(env.mongoUri);
    VendorMasterSupply = (await import('../../src/models/VendorMasterSupply.js')).default;
    B2BOrder = (await import('../../src/models/B2BOrder.js')).default;
    const categoryId = new mongoose.Types.ObjectId();

    const make = (key, supplierId, wholesaleRate, extra = {}) =>
        VendorMasterSupply.create({
            skuId: `SKU-FEE-${key}`,
            categoryId,
            materialName: `Fee Test ${key}`,
            quantity: '100 kg',
            wholesaleRate,
            gst: 18,
            supplierId,
            serialNumber: Object.keys(supplies).length + 1,
            isActive: 'y',
            approvalStatus: 'Approved',
            ...extra
        }).then(doc => { supplies[key] = doc; });

    await make('A100', SUP_A, 100);
    await make('B1000', SUP_B, 1000, { bulkThreshold: 10, bulkDiscount: 10 });
}, { timeout: 90000 });

after(async () => {
    await mongoose.disconnect().catch(() => {});
    if (env) await env.stop();
});

const line = (key, quantity, price = 999) => ({
    materialId: supplies[key]._id.toString(),
    name: supplies[key].materialName,
    quantity,
    price // client price: deliberately wrong, must not affect the fee
});

const setGlobalFee = body =>
    api(env.baseUrl, '/api/b2b-orders/admin/platform-fee-config', { method: 'PUT', token: admin.token, body });

const quote = (items, token = vendor.token) =>
    api(env.baseUrl, '/api/b2b-orders/quote', { method: 'POST', token, body: { items, pincode: VENDOR_PIN } });

const place = (items, extra = {}) =>
    api(env.baseUrl, '/api/b2b-orders/place', {
        method: 'POST',
        token: vendor.token,
        body: { vendorId: vendor.id, items, pincode: VENDOR_PIN, city: 'Indore', shippingAddress: '1 Test Rd', ...extra }
    });

const groupFor = (res, supplierId) => res.body.groups.find(g => g.supplierId === supplierId);

describe('first-run fee and explicit fee waiver', () => {
    test('global config defaults to a ₹40 flat fee', async () => {
        const res = await api(env.baseUrl, '/api/b2b-orders/admin/platform-fee-config', { token: admin.token });
        assert.equal(res.status, 200);
        assert.equal(res.body.enabled, true);
        assert.equal(res.body.type, 'FLAT');
        assert.equal(res.body.value, 40);
    });

    test('an explicitly disabled fee submits immediately and keeps supplier payment direct', async () => {
        await setGlobalFee({ enabled: false, type: 'FLAT', value: 40 });
        const res = await place([line('A100', 2)], { totalPlatformFee: 999 });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.razorpayOrderId, null);
        assert.equal(res.body.platformFeeAmount, 0);
        assert.equal(res.body.orders.length, 1);

        const order = await B2BOrder.findById(res.body.orders[0]._id).lean();
        assert.equal(order.status, 'SUBMITTED');
        assert.equal(order.paymentStatus, 'Direct');
        assert.equal(order.escrowStatus, 'Not Applicable');
        assert.equal(order.platformFee, 0);
        assert.equal(order.platformFeeStatus, 'NOT_APPLICABLE');
        assert.equal(order.stockDecreased, true);

        const supply = await VendorMasterSupply.findById(supplies.A100._id).lean();
        assert.equal(supply.quantity, '98 kg', 'stock must still be decreased on confirmation');
    });

    test('rejects an empty cart with 400 instead of 500', async () => {
        const res = await place([]);
        assert.equal(res.status, 400);
    });
});

describe('admin fee settings are admin-only and validated', () => {
    test('vendor cannot read or change the settings', async () => {
        const read = await api(env.baseUrl, '/api/b2b-orders/admin/platform-fee-config', { token: vendor.token });
        assert.equal(read.status, 403);
        const write = await api(env.baseUrl, '/api/b2b-orders/admin/platform-fee-config', {
            method: 'PUT', token: vendor.token, body: { enabled: false }
        });
        assert.equal(write.status, 403);
    });

    test('rejects invalid settings', async () => {
        assert.equal((await setGlobalFee({ enabled: true, type: 'PERCENTAGE', value: 150 })).status, 400);
        assert.equal((await setGlobalFee({ enabled: true, type: 'PERCENTAGE', value: 5, minFee: 50, maxFee: 10 })).status, 400);
        assert.equal((await setGlobalFee({ enabled: true, type: 'MULTIPLIER', value: 1.1 })).status, 400);
    });

    test('accepts valid settings', async () => {
        const res = await setGlobalFee({ enabled: true, type: 'PERCENTAGE', value: 5, minFee: 10, maxFee: 500 });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.deepEqual(
            { enabled: res.body.enabled, type: res.body.type, value: res.body.value, minFee: res.body.minFee, maxFee: res.body.maxFee },
            { enabled: true, type: 'PERCENTAGE', value: 5, minFee: 10, maxFee: 500 }
        );
    });
});

describe('fee quote is computed server-side (global 5%, min ₹10, max ₹500)', () => {
    before(async () => {
        await setGlobalFee({ enabled: true, type: 'PERCENTAGE', value: 5, minFee: 10, maxFee: 500 });
    });

    test('requires a logged-in user', async () => {
        const res = await api(env.baseUrl, '/api/b2b-orders/quote', { method: 'POST', body: { items: [line('A100', 1)] } });
        assert.equal(res.status, 401);
    });

    test('percentage of DB wholesale value, ignoring client prices', async () => {
        const res = await quote([line('A100', 4, 1)]); // 4 x ₹100 = ₹400 -> 5% = ₹20
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(groupFor(res, SUP_A).goodsSubtotal, 400);
        assert.equal(groupFor(res, SUP_A).platformFee, 20);
        assert.equal(res.body.totalPlatformFee, 20);
    });

    test('minimum fee applies to small orders', async () => {
        const res = await quote([line('A100', 1)]); // ₹100 -> ₹5 -> min ₹10
        assert.equal(groupFor(res, SUP_A).platformFee, 10);
    });

    test('bulk discount reduces the fee base', async () => {
        const res = await quote([line('B1000', 10)]); // 10 x ₹900 = ₹9000 -> ₹450
        assert.equal(groupFor(res, SUP_B).goodsSubtotal, 9000);
        assert.equal(groupFor(res, SUP_B).platformFee, 450);
    });

    test('maximum fee caps large orders', async () => {
        const res = await quote([line('B1000', 20)]); // ₹18000 -> ₹900 -> max ₹500
        assert.equal(groupFor(res, SUP_B).platformFee, 500);
    });

    test('fee is per supplier order and totalled', async () => {
        const res = await quote([line('A100', 4), line('B1000', 10)]);
        assert.equal(res.body.groups.length, 2);
        assert.equal(res.body.totalPlatformFee, 470);
    });
});

describe('supplier zone overrides (managed on the Supplier Service Zone page)', () => {
    let zoneAId, zoneBId;

    before(async () => {
        await setGlobalFee({ enabled: true, type: 'PERCENTAGE', value: 5, minFee: 10, maxFee: 500 });
    });

    test('rejects an invalid fee mode or percentage', async () => {
        const bad = await api(env.baseUrl, '/api/supplier-service-zones', {
            method: 'POST', token: admin.token,
            body: { zoneName: 'Bad Zone', supplierId: SUP_A, pincodes: [VENDOR_PIN], platformFeeMode: 'MULTIPLY' }
        });
        assert.equal(bad.status, 400);
        const badPct = await api(env.baseUrl, '/api/supplier-service-zones', {
            method: 'POST', token: admin.token,
            body: { zoneName: 'Bad Zone 2', supplierId: SUP_A, pincodes: [VENDOR_PIN], platformFeeMode: 'PERCENTAGE', platformFeeValue: 120 }
        });
        assert.equal(badPct.status, 400);
    });

    test('vendor cannot create zones', async () => {
        const res = await api(env.baseUrl, '/api/supplier-service-zones', {
            method: 'POST', token: vendor.token,
            body: { zoneName: 'Vendor Zone', supplierId: SUP_A, pincodes: [VENDOR_PIN], platformFeeMode: 'WAIVED' }
        });
        assert.equal(res.status, 403);
    });

    test('FLAT override on supplier A and WAIVED on supplier B', async () => {
        const a = await api(env.baseUrl, '/api/supplier-service-zones', {
            method: 'POST', token: admin.token,
            body: { zoneName: 'Fee Zone A', supplierId: SUP_A, pincodes: [VENDOR_PIN], platformFeeMode: 'FLAT', platformFeeValue: 25 }
        });
        assert.equal(a.status, 201, JSON.stringify(a.body));
        zoneAId = a.body._id;
        const b = await api(env.baseUrl, '/api/supplier-service-zones', {
            method: 'POST', token: admin.token,
            body: { zoneName: 'Fee Zone B', supplierId: SUP_B, pincodes: [VENDOR_PIN], platformFeeMode: 'WAIVED' }
        });
        assert.equal(b.status, 201, JSON.stringify(b.body));
        zoneBId = b.body._id;

        const res = await quote([line('A100', 4), line('B1000', 10)]);
        assert.equal(groupFor(res, SUP_A).platformFee, 25);
        assert.equal(groupFor(res, SUP_A).rule.source, 'ZONE');
        assert.equal(groupFor(res, SUP_B).platformFee, 0);
        assert.equal(res.body.totalPlatformFee, 25);
    });

    test('updating a zone back to DEFAULT restores the global rule', async () => {
        const upd = await api(env.baseUrl, `/api/supplier-service-zones/${zoneAId}`, {
            method: 'PUT', token: admin.token, body: { platformFeeMode: 'DEFAULT' }
        });
        assert.equal(upd.status, 200);
        const res = await quote([line('A100', 4)]);
        assert.equal(groupFor(res, SUP_A).platformFee, 20);
        assert.equal(groupFor(res, SUP_A).rule.source, 'GLOBAL');
    });

    test('zone update rejects invalid fee fields', async () => {
        const upd = await api(env.baseUrl, `/api/supplier-service-zones/${zoneBId}`, {
            method: 'PUT', token: admin.token, body: { platformFeeMode: 'NOPE' }
        });
        assert.equal(upd.status, 400);
    });

    test('live catalog exposes the fee rule and no longer inflates unit prices', async () => {
        const res = await api(env.baseUrl, `/api/vendor-master-supplies/live-catalog?vendorId=${vendor.id}`);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        const a = res.body.find(i => i._id === supplies.A100._id.toString());
        const b = res.body.find(i => i._id === supplies.B1000._id.toString());
        assert.ok(a && b, 'both test supplies are in the catalog');
        assert.equal(a.price, a.basePrice);
        assert.equal(a.platformFeeRule.type, 'PERCENTAGE');
        assert.equal(b.platformFeeRule.type, 'NONE');
    });
});

describe('placing a fee-due order', () => {
    before(async () => {
        await setGlobalFee({ enabled: true, type: 'PERCENTAGE', value: 5, minFee: 10, maxFee: 500 });
    });

    test('client cannot dodge the fee by sending totalPlatformFee: 0, and nothing is saved when the gateway is down', async () => {
        const before = await B2BOrder.countDocuments({ vendor: vendor.id });
        const res = await place([line('A100', 4)], { totalPlatformFee: 0 });
        assert.equal(res.status, 503, 'fee is due, so a payment must be collected');
        const afterCount = await B2BOrder.countDocuments({ vendor: vendor.id });
        assert.equal(afterCount, before, 'no orphaned PENDING_PAYMENT orders');
    });
});

describe('verifying the platform fee payment', () => {
    const RZP_ORDER = 'order_fee_test_1';
    let orderId;

    before(async () => {
        const order = await B2BOrder.create({
            vendor: vendor.id,
            items: [{ materialId: supplies.A100._id, name: 'Fee Test A100', quantity: 1, price: 118 }],
            status: 'PENDING_PAYMENT',
            cycleId: 'TEST-CYCLE',
            deliveryDay: 'Sunday',
            deliveryDate: new Date(),
            totalAmount: 118,
            platformFee: 25,
            platformFeeStatus: 'PENDING',
            razorpayOrderId: RZP_ORDER
        });
        orderId = order._id.toString();
    });

    const verify = (token, body) =>
        api(env.baseUrl, '/api/b2b-orders/verify-platform-fee', { method: 'POST', token, body });

    test('requires the razorpay order id', async () => {
        const res = await verify(vendor.token, { orderIds: [orderId] });
        assert.equal(res.status, 400);
    });

    test('unknown razorpay order -> 404', async () => {
        const res = await verify(vendor.token, { razorpay_order_id: 'order_nope', razorpay_payment_id: 'pay_1', razorpay_signature: 'x' });
        assert.equal(res.status, 404);
    });

    test("another vendor cannot confirm someone else's orders", async () => {
        const res = await verify(otherVendor.token, { razorpay_order_id: RZP_ORDER, razorpay_payment_id: 'pay_1', razorpay_signature: 'x' });
        assert.equal(res.status, 403);
    });

    test('forged signature fails closed and leaves the order pending', async () => {
        const res = await verify(vendor.token, { razorpay_order_id: RZP_ORDER, razorpay_payment_id: 'pay_1', razorpay_signature: 'forged' });
        assert.equal(res.status, 400);
        const order = await B2BOrder.findById(orderId).lean();
        assert.equal(order.status, 'PENDING_PAYMENT');
        assert.equal(order.platformFeeStatus, 'PENDING');
        assert.equal(order.paymentStatus, 'Direct');
    });
});

describe('admin vendor supply orders table', () => {
    test('is admin-only', async () => {
        assert.equal((await api(env.baseUrl, '/api/b2b-orders/admin/all')).status, 401);
        assert.equal((await api(env.baseUrl, '/api/b2b-orders/admin/all', { token: vendor.token })).status, 403);
    });

    test('lists orders with platform fee and summary, without delivery OTPs', async () => {
        const res = await api(env.baseUrl, '/api/b2b-orders/admin/all', { token: admin.token });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.ok(Array.isArray(res.body.orders) && res.body.orders.length >= 2);
        const pending = res.body.orders.find(o => o.razorpayOrderId === 'order_fee_test_1');
        assert.equal(pending.platformFee, 25);
        assert.equal(pending.platformFeeStatus, 'PENDING');
        assert.ok(res.body.orders.every(o => !('deliveryOtp' in o)));
        assert.equal(res.body.summary.pendingFees, 25);
    });

    test('filters by fee status', async () => {
        const res = await api(env.baseUrl, '/api/b2b-orders/admin/all?platformFeeStatus=PENDING', { token: admin.token });
        assert.equal(res.status, 200);
        assert.ok(res.body.orders.every(o => o.platformFeeStatus === 'PENDING'));
    });
});

describe('turning the fee off restores the zero-fee flow', () => {
    test('disabled global fee -> immediate confirmation again', async () => {
        await setGlobalFee({ enabled: false, type: 'PERCENTAGE', value: 5 });
        const res = await place([line('A100', 1)]);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.platformFeeAmount, 0);
        assert.equal(res.body.orders[0].status, 'SUBMITTED');
        assert.equal(res.body.orders[0].paymentStatus, 'Direct');
    });
});
