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
    assert.ok(results.every(r => [200, 409].includes(r.status)), 'Concurrent settlement checks may report the vendor lock');
    assert.equal((await retry()).status, 200);
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

test('linked-account transfer stays bank-pending until the provider reports settlement, without another transfer', async () => {
    const order = await paidOrder();
    assert.equal((await deliver(order)).status, 200);
    const transfer = [...gateway.transfers.values()].find(t => t.notes.order_id === order._id);
    const retry = () => request(`/api/admin/vendor-payments/route/${order._id}`, { method: 'POST', body: {} });
    let result = await retry();
    assert.equal(result.body.status, 'TRANSFERRED');
    assert.equal(result.body.bankSettlementStatus, 'PENDING');
    const summary = await request('/api/admin/vendor-payments');
    const row = summary.body.find(v => v._id === vendor.id);
    assert.ok(row.bankPendingAmount >= 236);
    assert.equal(row.status, 'Bank Pending');
    transfer.settlement_status = 'on_hold';
    result = await retry();
    assert.equal(result.body.bankSettlementStatus, 'ON_HOLD');
    transfer.settlement_status = 'settled';
    transfer.recipient_settlement_id = 'setl_testbank';
    result = await retry();
    assert.equal(result.body.bankSettlementStatus, 'SETTLED');
    assert.equal(result.body.recipientSettlementId, 'setl_testbank');
    const Payout = (await import('../../src/models/Payout.js')).default;
    const payout = await Payout.findOne({ order: order._id });
    assert.equal(payout.bankSettlementStatus, 'SETTLED');
    assert.equal(payout.recipientSettlementId, 'setl_testbank');
    assert.equal([...gateway.transfers.values()].filter(t => t.notes.order_id === order._id).length, 1);
});

test('a reversed transfer is flagged for review and cannot produce an automatic replacement', async () => {
    const order = await paidOrder();
    assert.equal((await deliver(order)).status, 200);
    const transfer = [...gateway.transfers.values()].find(t => t.notes.order_id === order._id);
    transfer.status = 'reversed'; transfer.amount_reversed = transfer.amount;
    const result = await request(`/api/admin/vendor-payments/route/${order._id}`, { method: 'POST', body: {} });
    assert.equal(result.body.bankSettlementStatus, 'REVIEW');
    const summary = await request('/api/admin/vendor-payments');
    assert.equal(summary.body.find(v => v._id === vendor.id).status, 'Review Required');
    assert.equal([...gateway.transfers.values()].filter(t => t.notes.order_id === order._id).length, 1);
});

test('queued provider transfers are fetched until processed and bank settlement is tracked separately', async () => {
    gateway.controls.transferStatus = 'pending';
    try {
        const order = await paidOrder();
        assert.equal((await deliver(order)).status, 200);
        const transfer = [...gateway.transfers.values()].find(t => t.notes.order_id === order._id);
        let result = await request(`/api/admin/vendor-payments/route/${order._id}`, { method: 'POST', body: {} });
        assert.equal(result.body.status, 'PENDING');
        transfer.status = 'processed';
        result = await request(`/api/admin/vendor-payments/route/${order._id}`, { method: 'POST', body: {} });
        assert.equal(result.body.status, 'TRANSFERRED');
        assert.equal(result.body.bankSettlementStatus, 'PENDING');
        assert.equal([...gateway.transfers.values()].filter(t => t.notes.order_id === order._id).length, 1);
    } finally { gateway.controls.transferStatus = 'processed'; }
});

test('refunded or underfunded captures cannot be routed', async () => {
    for (const type of ['refunded', 'underfunded']) {
        const order = await paidOrder();
        const payment = gateway.payments.get(order.razorpayPaymentId);
        if (type === 'refunded') payment.amount_refunded = 1;
        else payment.amount = 1;
        assert.equal((await deliver(order)).status, 200);
        const result = await request(`/api/admin/vendor-payments/route/${order._id}`, { method: 'POST', body: {} });
        assert.equal(result.body.status, 'BLOCKED');
        assert.equal([...gateway.transfers.values()].some(t => t.notes.order_id === order._id), false);
    }
});

test('vendor promotion routes the remaining net after reserving wallet credit and platform share', async () => {
    const Promotion = (await import('../../src/models/Promotion.js')).default;
    const promo = await Promotion.create({ title: 'Routing promo', code: 'ROUTEPROMO', owner_type: 'VENDOR', vendorId: vendor.id,
        scope_type: 'GLOBAL_ORDER', is_exclusive_window_eligible: true, discountType: 'Flat', discountValue: 100,
        approval_status: 'APPROVED', status: 'Active', start_date: new Date(Date.now() - 60000), expiryDate: new Date(Date.now() + 86400000) });
    try {
        const order = await paidOrder();
        const delivered = await deliver(order);
        assert.equal(delivered.status, 200);
        assert.equal(delivered.body.ledger.customerWalletCredit, 50);
        assert.equal(delivered.body.ledger.invoice2Total, 132.6);
        const transfer = [...gateway.transfers.values()].find(t => t.notes.order_id === order._id);
        assert.equal(transfer.amount, 13600);
        assert.equal(Math.round((delivered.body.ledger.invoice2Total + delivered.body.ledger.customerWalletCredit) * 100) + transfer.amount, 31860);
    } finally { await Promotion.deleteOne({ _id: promo._id }); }
});

test('A, B and C online collections each finalize two invoices and route the conserved vendor net', async () => {
    const User = (await import('../../src/models/User.js')).default;
    const Order = (await import('../../src/models/Order.js')).default;
    try {
        for (const [scenario, customerGst, vendorGst] of [
            ['A', '23FGHIJ5678K1Z2', '23ABCDE1234F1Z5'], ['B', '', '23ABCDE1234F1Z5'], ['C', '', '']
        ]) {
            await User.updateOne({ _id: customer.id }, { $set: { gstNumber: customerGst } });
            await User.updateOne({ _id: vendor.id }, { $set: { 'shopDetails.gst': vendorGst } });
            const order = await paidOrder();
            assert.equal((await deliver(order)).status, 200);
            const saved = await Order.findById(order._id).lean();
            assert.equal(saved.invoices.customerInvoice.scenario, scenario);
            assert.equal(saved.invoices.customerInvoice.documentStatus, 'FINALIZED');
            assert.equal(saved.invoices.platformInvoice.documentStatus, 'FINALIZED');
            assert.equal(saved.invoices.customerInvoice.totalAmount, 318.6);
            assert.equal(saved.invoices.customerInvoice.taxAmount, scenario === 'C' ? 0 : 48.6);
            assert.equal(saved.invoices.platformInvoice.totalInvoiceAmount, 82.6);
            const transfer = [...gateway.transfers.values()].find(t => t.notes.order_id === order._id);
            assert.equal(transfer.amount, 23600);
            assert.equal(transfer.amount + Math.round(saved.ledger.invoice2Total * 100), 31860);
        }
    } finally {
        await User.updateOne({ _id: customer.id }, { $set: { gstNumber: '' } });
        await User.updateOne({ _id: vendor.id }, { $set: { 'shopDetails.gst': '23ABCDE1234F1Z5' } });
    }
});

test('the scheduled reconciler follows processed transfers through bank settlement without sending again', async () => {
    const order = await paidOrder();
    assert.equal((await deliver(order)).status, 200);
    const transfer = [...gateway.transfers.values()].find(t => t.notes.order_id === order._id);
    transfer.settlement_status = 'settled'; transfer.recipient_settlement_id = 'setl_reconciled';
    const extraEnv = { ...gateway.env, RAZORPAY_ROUTE_ENABLED: 'true' };
    const previous = Object.fromEntries(Object.keys(extraEnv).map(key => [key, process.env[key]]));
    try {
        Object.assign(process.env, extraEnv);
        const { reconcileVendorSettlements } = await import('../../src/services/vendorSettlement.js');
        await reconcileVendorSettlements();
        const Order = (await import('../../src/models/Order.js')).default;
        const saved = await Order.findById(order._id);
        assert.equal(saved.vendorSettlement.bankSettlementStatus, 'SETTLED');
        assert.equal(saved.vendorSettlement.recipientSettlementId, 'setl_reconciled');
        assert.equal([...gateway.transfers.values()].filter(t => t.notes.order_id === order._id).length, 1);
    } finally {
        for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});
