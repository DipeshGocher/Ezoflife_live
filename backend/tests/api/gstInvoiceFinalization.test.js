import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { api, startTestEnvironment, FIXTURE_SERVICE_ID } from '../helpers/testEnvironment.js';
import { asUser, createUser, makeVendorCapableOf, orderPayload } from '../helpers/factories.js';

let env;
let customerSession;
let vendorSession;
let customerApi;
let vendorApi;
let orderId;

before(async () => {
    env = await startTestEnvironment();
    customerSession = await createUser(api, env.baseUrl, '9310000001', 'Customer');
    vendorSession = await createUser(api, env.baseUrl, '9310000002', 'Vendor');
    customerApi = asUser(api, env.baseUrl, customerSession.token);
    vendorApi = asUser(api, env.baseUrl, vendorSession.token);
    await makeVendorCapableOf(env.mongoUri, vendorSession.id, [FIXTURE_SERVICE_ID]);

    await mongoose.connect(env.mongoUri);
    const User = (await import('../../src/models/User.js')).default;
    await User.updateOne({ _id: customerSession.id }, {
        $set: {
            address: '12 Test Street, Indore, Madhya Pradesh 452001',
            addresses: [{ address: '12 Test Street', city: 'Indore', state: 'Madhya Pradesh', pincode: '452001', isDefault: true }]
        }
    });
    await User.updateOne({ _id: vendorSession.id }, {
        $set: {
            'shopDetails.gst': '23ABCDE1234F1Z5',
            'shopDetails.state': 'Madhya Pradesh',
            'shopDetails.city': 'Indore',
            'shopDetails.pincode': '452001'
        }
    });
    await mongoose.disconnect();

    const created = await customerApi('/api/orders', { method: 'POST', body: orderPayload(customerSession.id) });
    assert.equal(created.status, 201);
    orderId = created.body._id;
    const accepted = await vendorApi(`/api/orders/vendor-accept/${orderId}`, { method: 'POST', body: {} });
    assert.equal(accepted.status, 200);
});

after(async () => env?.stop());

describe('GST invoice delivery finalization', () => {
    test('does not expose a numbered invoice before delivery', async () => {
        const response = await customerApi(`/api/orders/${orderId}/invoices`);
        assert.equal(response.status, 409);
    });

    test('finalizes both invoices in the DELIVERED transition', async () => {
        const delivered = await vendorApi(`/api/orders/status/${orderId}`, {
            method: 'PATCH', body: { status: 'DELIVERED' }
        });
        assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
        assert.equal(delivered.body.invoiceFinalizationStatus, 'FINALIZED');

        const response = await vendorApi(`/api/orders/${orderId}/invoices`);
        assert.equal(response.status, 200);
        assert.match(response.body.customerInvoice.invoiceNo, /^SZ1\/\d{2}-\d{2}\/\d{6}$/);
        assert.match(response.body.platformInvoice.invoiceNo, /^SZ2\/\d{2}-\d{2}\/\d{6}$/);
        assert.equal(response.body.customerInvoice.documentStatus, 'FINALIZED');
        assert.equal(response.body.platformInvoice.documentStatus, 'FINALIZED');
        assert.ok(response.body.customerInvoice.lineItems.every(line => line.sacCode));
        assert.ok(response.body.platformInvoice.lineItems.every(line => line.sacCode));
        assert.ok(response.body.customerInvoice.cgstAmount > 0);
        assert.ok(response.body.customerInvoice.sgstAmount > 0);
        assert.equal(response.body.customerInvoice.igstAmount, 0);
    });

    test('customer receives Invoice 1 only', async () => {
        const response = await customerApi(`/api/orders/${orderId}/invoices`);
        assert.equal(response.status, 200);
        assert.ok(response.body.customerInvoice);
        assert.equal(Object.hasOwn(response.body, 'platformInvoice'), false);
    });

    test('repeated delivery does not allocate replacement invoice numbers', async () => {
        const before = await vendorApi(`/api/orders/${orderId}/invoices`);
        const repeated = await vendorApi(`/api/orders/status/${orderId}`, {
            method: 'PATCH', body: { status: 'DELIVERED' }
        });
        assert.equal(repeated.status, 200);
        const after = await vendorApi(`/api/orders/${orderId}/invoices`);
        assert.equal(after.body.customerInvoice.invoiceNo, before.body.customerInvoice.invoiceNo);
        assert.equal(after.body.platformInvoice.invoiceNo, before.body.platformInvoice.invoiceNo);
    });
});

describe('atomic promotion settlement', () => {
    test('concurrent acceptance claims once and credits cashback exactly once', async () => {
        await mongoose.connect(env.mongoUri);
        const Promotion = (await import('../../src/models/Promotion.js')).default;
        const User = (await import('../../src/models/User.js')).default;
        await Promotion.create({
            title: 'Atomic cashback', code: `ATOMIC${Date.now()}`, owner_type: 'VENDOR',
            vendorId: vendorSession.id, scope_type: 'GLOBAL_ORDER', is_exclusive_window_eligible: true,
            discountType: 'Flat', discountValue: 100, minOrderValue: 0,
            approval_status: 'APPROVED', status: 'Active',
            start_date: new Date(Date.now() - 60000), expiryDate: new Date(Date.now() + 86400000)
        });
        const walletBefore = (await User.findById(customerSession.id).lean()).walletBalance || 0;
        await mongoose.disconnect();

        const created = await customerApi('/api/orders', { method: 'POST', body: orderPayload(customerSession.id) });
        assert.equal(created.status, 201);
        const accept = () => vendorApi(`/api/orders/vendor-accept/${created.body._id}`, { method: 'POST', body: {} });
        const responses = await Promise.all([accept(), accept()]);
        assert.equal(responses.filter(response => response.status === 200).length, 1);
        assert.equal(responses.filter(response => [400, 409].includes(response.status)).length, 1);

        await mongoose.connect(env.mongoUri);
        const customer = await User.findById(customerSession.id).lean();
        const creditedOrderIds = customer.creditedPromotionOrders.map(String);
        await mongoose.disconnect();
        assert.equal(customer.walletBalance, walletBefore + 50);
        assert.equal(creditedOrderIds.filter(id => id === String(created.body._id)).length, 1);
    });
});
