import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { api, startTestEnvironment, FIXTURE_SERVICE_ID } from '../helpers/testEnvironment.js';
import { createUser, makeVendorCapableOf, orderPayload, tokenFor } from '../helpers/factories.js';
import { startFakeRazorpay } from '../helpers/fakeRazorpay.js';
let env, gateway, customer, vendor;
const admin = tokenFor('Admin');
const request = (path, opts = {}) => api(env.baseUrl, path, { token: admin, ...opts });
before(async () => {
    gateway = await startFakeRazorpay();
    env = await startTestEnvironment({ env: { ...gateway.env, RAZORPAY_ROUTE_ENABLED: 'true' } });
    customer = await createUser(api, env.baseUrl, '9320000101', 'Customer');
    vendor = await createUser(api, env.baseUrl, '9320000102', 'Vendor');
    await makeVendorCapableOf(env.mongoUri, vendor.id, [FIXTURE_SERVICE_ID]);
    await mongoose.connect(env.mongoUri);
    const User = (await import('../../src/models/User.js')).default;
    await User.updateOne({ _id: customer.id }, { $set: { addresses: [{ address: '12 Test Street', state: 'Madhya Pradesh', city: 'Indore', pincode: '452001', isDefault: true }] } });
    await User.updateOne({ _id: vendor.id }, { $set: { 'shopDetails.gst': '23ABCDE1234F1Z5', 'shopDetails.state': 'Madhya Pradesh', razorpayLinkedAccountId: 'acc_testvendor' } });
    await mongoose.connection.collection('masterservices').updateOne({ _id: new mongoose.Types.ObjectId(FIXTURE_SERVICE_ID) }, { $set: { gst: 18 } });
    await mongoose.connection.collection('systemconfigs').insertMany([{ key: 'platform_fee_multiplier', value: 0.1 }, { key: 'normal_logistics_fee', value: 50 }]);
}, { timeout: 90000 });
after(async () => { await mongoose.disconnect(); await env?.stop(); await gateway?.stop(); });
const paidOrder = async (overrides = {}) => {
    const payload = orderPayload(customer.id, overrides);
    const checkout = await request('/api/orders/razorpay', { token: customer.token, method: 'POST', body: { purpose: 'CUSTOMER_ORDER', order: payload } });
    assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
    const proof = gateway.pay(checkout.body.id);
    const created = await request('/api/orders', { token: customer.token, method: 'POST', body: { ...payload, paymentMethod: 'Online', razorpayOrderId: proof.razorpay_order_id, razorpayPaymentId: proof.razorpay_payment_id, razorpaySignature: proof.razorpay_signature } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const accepted = await request(`/api/orders/vendor-accept/${created.body._id}`, { token: vendor.token, method: 'POST', body: {} });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    return created.body;
};
const deliver = order => request(`/api/orders/status/${order._id}`, { token: vendor.token, method: 'PATCH', body: { status: 'DELIVERED' } });

test('delivery routes exactly the invoice-derived net amount once and leaves platform/wallet share in Spinzyt account', async () => {
    const order = await paidOrder();
    assert.equal((await deliver(order)).status, 200);
    const transfer = [...gateway.transfers.values()].find(t => t.notes.order_id === order._id);
    assert.ok(transfer);
    assert.equal(transfer.amount, 23600);
    assert.equal(transfer.recipient, 'acc_testvendor');
    const retry = () => request(`/api/admin/vendor-payments/route/${order._id}`, { method: 'POST', body: {} });
    const results = await Promise.all([retry(), retry()]);
    assert.ok(results.every(r => r.status === 200));
    assert.equal([...gateway.transfers.values()].filter(t => t.notes.order_id === order._id).length, 1);
    const Payout = (await import('../../src/models/Payout.js')).default;
    assert.equal(await Payout.countDocuments({ order: order._id }), 1);
});

test('retry after lost transfer response is provider-idempotent', async () => {
    const order = await paidOrder();
    gateway.controls.failTransferResponseOnce = true;
    assert.equal((await deliver(order)).status, 200);
    const manual = await request('/api/admin/record-vendor-payout', { method: 'POST', body: { vendorId: vendor.id, amount: 1, transactionId: 'overlap', paymentMethod: 'Bank Transfer' } });
    assert.equal(manual.status, 409, 'Pending route amount must be reserved against manual payout');
    const result = await request(`/api/admin/vendor-payments/route/${order._id}`, { method: 'POST', body: {} });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.status, 'TRANSFERRED');
    assert.equal([...gateway.transfers.values()].filter(t => t.notes.order_id === order._id).length, 1);
});

test('non-admin cannot initiate transfers or change linked destination', async () => {
    assert.equal((await request(`/api/admin/vendor-payments/account/${vendor.id}`, { token: vendor.token, method: 'POST', body: { account: 'acc_attacker' } })).status, 403);
    assert.equal((await request(`/api/admin/vendor-payments/route/${new mongoose.Types.ObjectId()}`, { token: customer.token, method: 'POST', body: {} })).status, 403);
});

test('missing vendor linked account blocks a transfer until configured through the admin API', async () => {
    const User = (await import('../../src/models/User.js')).default;
    await User.updateOne({ _id: vendor.id }, { $set: { razorpayLinkedAccountId: '' } });
    const order = await paidOrder();
    assert.equal((await deliver(order)).status, 200);
    assert.equal([...gateway.transfers.values()].some(t => t.notes.order_id === order._id), false);
    assert.equal((await request(`/api/admin/vendor-payments/account/${vendor.id}`, { method: 'POST', body: { account: 'acc_testvendor' } })).status, 200);
    const retry = await request(`/api/admin/vendor-payments/route/${order._id}`, { method: 'POST', body: {} });
    assert.equal(retry.body.status, 'TRANSFERRED');
});


test('manual payouts cannot exceed outstanding invoice earnings or duplicate routed payments', async () => {
    const result = await request('/api/admin/record-vendor-payout', { method: 'POST', body: { vendorId: vendor.id, amount: 100000, transactionId: 'manual_overpayment', paymentMethod: 'Bank Transfer' } });
    assert.equal(result.status, 409);
    const Payout = (await import('../../src/models/Payout.js')).default;
    assert.equal(await Payout.countDocuments({ transactionId: 'manual_overpayment' }), 0);
});


test('online plus wallet funding routes the complete vendor net from the platform balance', async () => {
    const User = (await import('../../src/models/User.js')).default;
    await User.updateOne({ _id: customer.id }, { $set: { walletBalance: 100 } });
    const order = await paidOrder({ useWallet: true });
    assert.equal(order.walletAmountDeducted, 100);
    assert.equal((await deliver(order)).status, 200);
    const transfer = [...gateway.transfers.values()].find(t => t.notes.order_id === order._id);
    assert.ok(transfer);
    assert.equal(transfer.amount, 23600);
});
