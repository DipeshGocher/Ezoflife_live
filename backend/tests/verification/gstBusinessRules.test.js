/** Acceptance checks for the requested GST rules, isolated from the app database.
 * Run: npm run verify:gst (nonzero exit means a business rule is not met).
 */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { api, startTestEnvironment, FIXTURE_SERVICE_ID } from '../helpers/testEnvironment.js';
import { asUser, createUser, makeVendorCapableOf, orderPayload, tokenFor } from '../helpers/factories.js';
import { GST_DEMO_ACCOUNTS } from '../helpers/gstAccounts.js';

let env;
const sessions = {};
const cases = {};
const round = value => Math.round(value * 100) / 100;
const call = (name, path, options) => asUser(api, env.baseUrl, sessions[name].token)(path, options);
const createOrder = async customer => {
    const result = await call(customer, '/api/orders', { method: 'POST', body: orderPayload(sessions[customer].id) });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body;
};
const complete = async (customer, vendor) => {
    const order = await createOrder(customer);
    const accepted = await call(vendor, `/api/orders/vendor-accept/${order._id}`, { method: 'POST', body: {} });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const delivered = await call(vendor, `/api/orders/status/${order._id}`, { method: 'PATCH', body: { status: 'DELIVERED' } });
    assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
    const response = await call(vendor, `/api/orders/${order._id}/invoices`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return { order, ...response.body, ledger: delivered.body.ledger };
};

before(async () => {
    env = await startTestEnvironment();
    for (const [name, account] of Object.entries(GST_DEMO_ACCOUNTS)) {
        sessions[name] = await createUser(api, env.baseUrl, account.phone, account.role);
        assert.equal(sessions[name].status, 200);
        if (account.role === 'Vendor') await makeVendorCapableOf(env.mongoUri, sessions[name].id, [FIXTURE_SERVICE_ID]);
    }
    await mongoose.connect(env.mongoUri);
    const User = (await import('../../src/models/User.js')).default;
    for (const [name, account] of Object.entries(GST_DEMO_ACCOUNTS)) {
        const { shopDetails, ...rest } = account;
        const update = { ...rest };
        if (shopDetails) for (const [key, value] of Object.entries(shopDetails)) {
            if (key !== 'services') update[`shopDetails.${key}`] = value;
        }
        await User.updateOne({ _id: sessions[name].id }, { $set: update });
    }
    await mongoose.connection.collection('masterservices').updateOne({ _id: new mongoose.Types.ObjectId(FIXTURE_SERVICE_ID) }, { $set: { gst: 18 } });
    await mongoose.connection.collection('systemconfigs').insertMany([
        { key: 'platform_fee_multiplier', value: 0.1 },
        { key: 'normal_logistics_fee', value: 50 }
    ]);
    cases.A = await complete('rdCustomer', 'rdVendor');
    cases.B = await complete('urdCustomer', 'rdVendor');
    cases.C = await complete('urdCustomer', 'urdVendor');
}, { timeout: 90000 });
after(async () => { await mongoose.disconnect(); await env?.stop(); });

for (const [scenario, expectedGstin] of [
    ['A', GST_DEMO_ACCOUNTS.rdCustomer.gstNumber],
    ['B', GST_DEMO_ACCOUNTS.rdVendor.shopDetails.gst],
    ['C', '23ABCDE1234F1Z5']
]) {
    test(`${scenario}: finalizes distinct invoices and displays the correct GSTIN`, () => {
        const { customerInvoice: one, platformInvoice: two } = cases[scenario];
        assert.equal(one.scenario, scenario);
        assert.equal(one.displayGstinNo, expectedGstin);
        assert.equal(two.spinzytGstin, '23ABCDE1234F1Z5');
        assert.match(one.invoiceNo, /^SZ1\//);
        assert.match(two.invoiceNo, /^SZ2\//);
        assert.notEqual(one.invoiceNo, two.invoiceNo);
        assert.equal(one.documentStatus, 'FINALIZED');
        assert.equal(two.documentStatus, 'FINALIZED');
    });
    test(`${scenario}: Invoice 1 taxes the full service + platform + logistics value`, () => {
        const one = cases[scenario].customerInvoice;
        assert.equal(one.serviceValue, scenario === 'C' ? 318.6 : 270);
        assert.equal(one.taxAmount, scenario === 'C' ? 0 : 48.6);
        assert.equal(one.totalAmount, 318.6);
    });
    test(`${scenario}: Invoice 1 reconciles to the customer order payment`, () => {
        assert.equal(cases[scenario].customerInvoice.totalAmount, cases[scenario].order.totalAmount);
    });
    test(`${scenario}: Invoice 2 uses configured fees/taxes and payout balances`, () => {
        const { customerInvoice: one, platformInvoice: two, ledger } = cases[scenario];
        assert.equal(two.platformFee, 20);
        assert.equal(two.platformFeeTax, 3.6);
        assert.equal(two.logisticsFee, 50);
        assert.equal(two.logisticsFeeTax, 9);
        assert.equal(two.totalInvoiceAmount, 82.6);
        assert.equal(ledger.vendorNetPayout, round(one.totalAmount - two.totalInvoiceAmount));
    });
}

test('RD customer order is hidden from URD vendor and cannot be viewed/accepted/fulfilled', async () => {
    const order = await createOrder('rdCustomer');
    const pool = await call('urdVendor', `/api/orders/pool?vendorId=${sessions.urdVendor.id}`);
    assert.equal(pool.status, 200);
    assert.equal(pool.body.some(row => String(row._id) === String(order._id)), false);
    const rdPool = await call('rdVendor', `/api/orders/pool?vendorId=${sessions.rdVendor.id}`);
    assert.equal(rdPool.status, 200);
    assert.ok(rdPool.body.some(row => String(row._id) === String(order._id)));
    for (const [path, method, body] of [
        [`/api/orders/${order._id}`, 'GET', undefined],
        [`/api/orders/vendor-accept/${order._id}`, 'POST', {}],
        [`/api/orders/status/${order._id}`, 'PATCH', { status: 'DELIVERED' }]
    ]) assert.ok([403, 404].includes((await call('urdVendor', path, { method, body })).status), path);
});

test('customer sees Invoice 1 only; unrelated customer/vendor cannot see either', async () => {
    const path = `/api/orders/${cases.A.order._id}/invoices`;
    const response = await call('rdCustomer', path);
    assert.equal(response.status, 200);
    assert.ok(response.body.customerInvoice);
    assert.equal(Object.hasOwn(response.body, 'platformInvoice'), false);
    assert.equal((await call('urdCustomer', path)).status, 403);
    assert.equal((await call('urdVendor', path)).status, 403);
});

test('admin cannot see either invoice under the requested customer/vendor-only rule', async () => {
    const result = await api(env.baseUrl, `/api/orders/${cases.A.order._id}/invoices`, { token: tokenFor('Admin') });
    assert.equal(result.status, 403);
});

test('changed database tax rates apply to Invoice 1 fees and Invoice 2 independently', async () => {
    const configs = mongoose.connection.collection('systemconfigs');
    await mongoose.connection.collection('masterservices').updateOne({ _id: new mongoose.Types.ObjectId(FIXTURE_SERVICE_ID) }, { $set: { gst: 12 } });
    for (const [key, value] of [['gst_percent', 12], ['platform_fee_gst_percent', 7], ['logistics_fee_gst_percent', 9]]) {
        await configs.updateOne({ key }, { $set: { value } });
    }
    try {
        const result = await complete('urdCustomer', 'rdVendor');
        assert.equal(result.platformInvoice.platformFeeTax, 1.4);
        assert.equal(result.platformInvoice.logisticsFeeTax, 4.5);
        assert.equal(result.customerInvoice.taxAmount, 32.4);
        assert.ok(result.customerInvoice.lineItems.every(line => line.gstRate === 12));
    } finally {
        await mongoose.connection.collection('masterservices').updateOne({ _id: new mongoose.Types.ObjectId(FIXTURE_SERVICE_ID) }, { $set: { gst: 18 } });
        for (const key of ['gst_percent', 'platform_fee_gst_percent', 'logistics_fee_gst_percent']) await configs.updateOne({ key }, { $set: { value: 18 } });
    }
});

test('vendor promotion credits 50% once and shows each share only on its invoice', async () => {
    const Promotion = (await import('../../src/models/Promotion.js')).default;
    const User = (await import('../../src/models/User.js')).default;
    await Promotion.create({
        title: 'GST matrix promotion', code: 'GSTMATRIX100', owner_type: 'VENDOR',
        vendorId: sessions.rdVendor.id, scope_type: 'GLOBAL_ORDER', is_exclusive_window_eligible: true,
        discountType: 'Flat', discountValue: 100, minOrderValue: 0,
        approval_status: 'APPROVED', status: 'Active',
        start_date: new Date(Date.now() - 60000), expiryDate: new Date(Date.now() + 86400000)
    });
    const beforeWallet = (await User.findById(sessions.urdCustomer.id).lean()).walletBalance || 0;
    const result = await complete('urdCustomer', 'rdVendor');
    assert.equal(result.customerInvoice.customerWalletCredit, 50);
    assert.equal(Object.hasOwn(result.customerInvoice, 'spinzytPromoShare'), false);
    assert.equal(result.platformInvoice.spinzytPromoShare, 50);
    assert.equal(Object.hasOwn(result.platformInvoice, 'customerWalletCredit'), false);
    assert.equal(result.platformInvoice.totalInvoiceAmount, 132.6);
    assert.equal(result.ledger.vendorNetPayout, round(result.customerInvoice.totalAmount - result.platformInvoice.totalInvoiceAmount - 50));
    await call('rdVendor', `/api/orders/vendor-accept/${result.order._id}`, { method: 'POST', body: {} });
    const afterWallet = (await User.findById(sessions.urdCustomer.id).lean()).walletBalance;
    assert.equal(afterWallet, beforeWallet + 50);
});


test('URD vendor cannot impersonate an RD vendor through the pool vendorId parameter', async () => {
    const order = await createOrder('rdCustomer');
    const response = await call('urdVendor', `/api/orders/pool?vendorId=${sessions.rdVendor.id}`);
    if ([403, 404].includes(response.status)) return;
    assert.equal(response.status, 200);
    assert.equal(response.body.some(row => String(row._id) === String(order._id)), false);
});

test('Invoice 2 uses the configured fixed platform fee, independently of customer percentage pricing', async () => {
    const configs = mongoose.connection.collection('systemconfigs');
    await configs.updateOne({ key: 'platform_fee_fixed' }, { $set: { value: 35 } });
    try {
        const result = await complete('urdCustomer', 'rdVendor');
        assert.equal(result.platformInvoice.platformFee, 35);
        assert.equal(result.platformInvoice.platformFeeTax, 6.3);
    } finally {
        await configs.updateOne({ key: 'platform_fee_fixed' }, { $set: { value: 20 } });
    }
});


test('admin order detail and list do not leak invoice documents', async () => {
    const token = tokenFor('Admin');
    const detail = await api(env.baseUrl, `/api/orders/${cases.A.order._id}`, { token });
    assert.equal(detail.status, 200);
    assert.equal(Object.hasOwn(detail.body, 'invoices'), false);
    const list = await api(env.baseUrl, '/api/orders/all', { token });
    assert.equal(list.status, 200);
    assert.ok(list.body.every(order => !Object.hasOwn(order, 'invoices')));
});

test('URD inclusive line totals equal the customer payment with zero GST', () => {
    const invoice = cases.C.customerInvoice;
    assert.equal(round(invoice.lineItems.reduce((sum, line) => sum + line.totalAmount, 0)), invoice.totalAmount);
    assert.ok(invoice.lineItems.every(line => line.gstRate === 0 && line.cgstAmount === 0 && line.sgstAmount === 0 && line.igstAmount === 0));
});


test('paid checkout retains its tax rates when configuration changes before vendor acceptance', async () => {
    const order = await createOrder('rdCustomer');
    const configs = mongoose.connection.collection('systemconfigs');
    await configs.updateOne({ key: 'gst_percent' }, { $set: { value: 0 } });
    try {
        const accepted = await call('rdVendor', `/api/orders/vendor-accept/${order._id}`, { method: 'POST', body: {} });
        assert.equal(accepted.status, 200);
        const invoice = accepted.body.invoices.customerInvoice;
        assert.equal(invoice.taxAmount, 48.6);
        assert.equal(invoice.totalAmount, order.totalAmount);
        assert.ok(invoice.lineItems.every(line => line.gstRate === 18));
    } finally {
        await configs.updateOne({ key: 'gst_percent' }, { $set: { value: 18 } });
    }
});

test('configured zero tax rates stay zero in checkout and both invoices', async () => {
    const configs = mongoose.connection.collection('systemconfigs');
    await mongoose.connection.collection('masterservices').updateOne({ _id: new mongoose.Types.ObjectId(FIXTURE_SERVICE_ID) }, { $set: { gst: 0 } });
    for (const key of ['gst_percent', 'platform_fee_gst_percent', 'logistics_fee_gst_percent']) await configs.updateOne({ key }, { $set: { value: 0 } });
    try {
        const result = await complete('rdCustomer', 'rdVendor');
        assert.equal(result.customerInvoice.taxAmount, 0);
        assert.equal(result.customerInvoice.totalAmount, result.order.totalAmount);
        assert.equal(result.platformInvoice.platformFeeTax, 0);
        assert.equal(result.platformInvoice.logisticsFeeTax, 0);
    } finally {
        await mongoose.connection.collection('masterservices').updateOne({ _id: new mongoose.Types.ObjectId(FIXTURE_SERVICE_ID) }, { $set: { gst: 18 } });
        for (const key of ['gst_percent', 'platform_fee_gst_percent', 'logistics_fee_gst_percent']) await configs.updateOne({ key }, { $set: { value: 18 } });
    }
});
