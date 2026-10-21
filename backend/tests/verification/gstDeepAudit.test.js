/* Regression coverage for the deep GST audit. Uses a temporary database; app data is untouched. */
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { renderCustomerInvoiceHtml } from '../../../frontend/src/lib/customerInvoiceHtml.js';
import { io } from 'socket.io-client';
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


const printSource = readFileSync(new URL('../../../frontend/src/modules/user/pages/OrdersHistoryPage.jsx', import.meta.url), 'utf8');
const printFunction = printSource.slice(printSource.indexOf('  const handleDownloadInvoice ='), printSource.indexOf('\n  return (\n    <motion.div', printSource.indexOf('  const handleDownloadInvoice =')));
const printed = order => {
    let html = '';
    vm.runInNewContext(`${printFunction};handleDownloadInvoice(order);`, {
        order, renderCustomerInvoiceHtml, toast: { error() {} }, userData: GST_DEMO_ACCOUNTS.rdCustomer, invoiceSettings: null,
        window: { location: { origin: 'http://localhost' }, open: () => ({ document: { write: value => { html = value; }, close() {} } }) }
    });
    return html;
};
const withPromotion = async (fields, run) => {
    const Promotion = (await import('../../src/models/Promotion.js')).default;
    const promo = await Promotion.create({
        title: 'Deep GST audit promotion', code: `DEEP${Date.now()}`, owner_type: 'VENDOR', vendorId: sessions.rdVendor.id,
        scope_type: 'GLOBAL_ORDER', is_exclusive_window_eligible: true,
        discountType: 'Flat', discountValue: 100, minOrderValue: 0,
        approval_status: 'APPROVED', status: 'Active',
        start_date: new Date(Date.now() - 60000), expiryDate: new Date(Date.now() + 86400000), ...fields
    });
    try { await run(promo); } finally { await Promotion.deleteOne({ _id: promo._id }); }
};

test('customer PDF generation succeeds without an undefined variable', () => {
    assert.doesNotThrow(() => printed({ ...cases.A.order, status: 'DELIVERED', invoices: { customerInvoice: cases.A.customerInvoice } }));
});

test('customer PDF uses the finalized Invoice 1 number', () => {
    const html = printed({ ...cases.A.order, status: 'DELIVERED', invoices: { customerInvoice: cases.A.customerInvoice } });
    assert.ok(html.includes(cases.A.customerInvoice.invoiceNo), `Printed number does not contain ${cases.A.customerInvoice.invoiceNo}`);
});

test('customer cannot print a numbered final invoice from an undelivered order', () => {
    const html = printed(cases.A.order); // the original ORDER_PLACED payload, before acceptance
    assert.ok(!html.includes('SZ-CUST-2026-'), 'A made-up invoice number was printed before delivery');
});

test('URD customer PDF prints the frozen inclusive line amounts', () => {
    const invoice = cases.C.customerInvoice;
    const html = printed({ ...cases.C.order, status: 'DELIVERED', invoices: { customerInvoice: invoice } });
    assert.ok(html.includes(`₹${invoice.lineItems[0].unitPrice}`), `Expected inclusive unit price ${invoice.lineItems[0].unitPrice}`);
});

test('unauthenticated socket cannot read a vendor platform invoice', async () => {
    const client = io(env.baseUrl, { transports: ['websocket'], reconnection: false, timeout: 3000 });
    try {
        const connected = await new Promise(resolve => { client.once('connect', () => resolve(true)); client.once('connect_error', () => resolve(false)); });
        if (!connected) return;
        client.emit('join_room', `user_${sessions.rdVendor.id}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        const order = await createOrder('rdCustomer');
        const accepted = await call('rdVendor', `/api/orders/vendor-accept/${order._id}`, { method: 'POST', body: {} });
        assert.equal(accepted.status, 200);
        const event = new Promise(resolve => { client.once('order_status_update', resolve); setTimeout(() => resolve(null), 1500); });
        await call('rdVendor', `/api/orders/status/${order._id}`, { method: 'PATCH', body: { status: 'DELIVERED' } });
        const payload = await event;
        assert.equal(Boolean(payload?.invoices?.platformInvoice), false, 'No token was supplied, but Invoice 2 was received');
    } finally { client.disconnect(); }
});

test('RD order keeps the business GSTIN captured at checkout after a profile edit', async () => {
    const User = (await import('../../src/models/User.js')).default;
    const order = await createOrder('rdCustomer');
    await User.updateOne({ _id: sessions.rdCustomer.id }, { $set: { gstNumber: '' } });
    try {
        const accepted = await call('rdVendor', `/api/orders/vendor-accept/${order._id}`, { method: 'POST', body: {} });
        assert.equal(accepted.status, 200);
        assert.equal(accepted.body.invoices.customerInvoice.scenario, 'A');
        assert.equal(accepted.body.invoices.customerInvoice.recipientGstin, GST_DEMO_ACCOUNTS.rdCustomer.gstNumber);
    } finally { await User.updateOne({ _id: sessions.rdCustomer.id }, { $set: { gstNumber: GST_DEMO_ACCOUNTS.rdCustomer.gstNumber } }); }
});

test('vendor promotion outside the minimum value and geofence is not credited', async () => {
    await withPromotion({ minOrderValue: 1000000, min_order_value: 1000000, geofence_id: new mongoose.Types.ObjectId() }, async () => {
        const result = await complete('urdCustomer', 'rdVendor');
        assert.equal(result.customerInvoice.customerWalletCredit, 0);
    });
});

test('unapproved platform promotion cannot discount a server-priced checkout', async () => {
    await withPromotion({ owner_type: 'PLATFORM', vendorId: null, approval_status: 'PENDING' }, async promo => {
        const result = await call('urdCustomer', '/api/orders/quote', { method: 'POST', body: { ...orderPayload(sessions.urdCustomer.id), promoApplied: String(promo._id) } });
        assert.equal(result.status, 200);
        assert.equal(result.body.discount, 0);
    });
});

test('combined platform and vendor promotions preserve the actual checkout price', async () => {
    await withPromotion({ owner_type: 'PLATFORM', vendorId: null, code: `PLATFORM${Date.now()}` }, async platform => {
        await withPromotion({ code: `VENDOR${Date.now()}` }, async () => {
            const order = await call('urdCustomer', '/api/orders', { method: 'POST', body: orderPayload(sessions.urdCustomer.id, { promoApplied: String(platform._id) }) });
            assert.equal(order.status, 201);
            const accepted = await call('rdVendor', `/api/orders/vendor-accept/${order.body._id}`, { method: 'POST', body: {} });
            assert.equal(accepted.status, 200);
            assert.equal(accepted.body.invoices.customerInvoice.totalAmount, round(order.body.totalAmount - order.body.discountAmount));
        });
    });
});

test('cancelling an accepted vendor promotion reverses its wallet credit', async () => {
    const User = (await import('../../src/models/User.js')).default;
    await withPromotion({}, async () => {
        const walletBefore = (await User.findById(sessions.urdCustomer.id).lean()).walletBalance;
        const order = await createOrder('urdCustomer');
        assert.equal((await call('rdVendor', `/api/orders/vendor-accept/${order._id}`, { method: 'POST', body: {} })).status, 200);
        assert.equal((await call('urdCustomer', `/api/orders/cancel/${order._id}`, { method: 'POST', body: {} })).status, 200);
        assert.equal((await User.findById(sessions.urdCustomer.id).lean()).walletBalance, walletBefore);
    });
});

test('full-value vendor promotion does not create a negative transferable payout', async () => {
    await withPromotion({ discountValue: 1000 }, async () => {
        const result = await complete('urdCustomer', 'rdVendor');
        assert.ok(result.ledger.vendorNetPayout >= 0, `Negative payout ${result.ledger.vendorNetPayout}`);
    });
});

test('interstate invoices use IGST only and total correctly', async () => {
    const User = (await import('../../src/models/User.js')).default;
    await User.updateOne({ _id: sessions.rdCustomer.id }, { $set: { gstNumber: '27ABCDE1234F1Z5' } });
    try {
        const result = await complete('rdCustomer', 'rdVendor');
        assert.equal(result.customerInvoice.cgstAmount, 0);
        assert.equal(result.customerInvoice.sgstAmount, 0);
        assert.equal(result.customerInvoice.igstAmount, 48.6);
        assert.equal(result.customerInvoice.totalAmount, result.order.totalAmount);
    } finally { await User.updateOne({ _id: sessions.rdCustomer.id }, { $set: { gstNumber: GST_DEMO_ACCOUNTS.rdCustomer.gstNumber } }); }
});


test('vendor earnings endpoint includes delivered uppercase statuses and the invoice-based ledger', async () => {
    const Order = (await import('../../src/models/Order.js')).default;
    const orders = await Order.find({ vendor: sessions.rdVendor.id, status: 'DELIVERED' }).lean();
    const expected = round(orders.reduce((sum, order) => sum + order.ledger.vendorNetPayout, 0));
    const response = await call('rdVendor', `/api/auth/vendor-earnings?vendorId=${sessions.rdVendor.id}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.totalEarnings, expected);
});

test('admin payout summary respects negative ledger rather than substituting base service earnings', async () => {
    const Order = (await import('../../src/models/Order.js')).default;
    const orders = await Order.find({ vendor: sessions.rdVendor.id, status: { $in: ['DELIVERED', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY'] } }).lean();
    const expected = round(orders.reduce((sum, order) => sum + order.ledger.vendorNetPayout, 0));
    const response = await api(env.baseUrl, '/api/admin/vendor-payments', { token: tokenFor('Admin') });
    assert.equal(response.status, 200);
    const summary = response.body.find(row => String(row._id) === String(sessions.rdVendor.id));
    assert.equal(round(summary.netPayable), expected);
});

test('platform discount metadata is retained when a different vendor cashback promotion is applied', async () => {
    await withPromotion({ owner_type: 'PLATFORM', vendorId: null, discountValue: 25, code: `PLAT25${Date.now()}` }, async platform => {
        await withPromotion({ code: `VEND100${Date.now()}` }, async () => {
            const order = await call('urdCustomer', '/api/orders', { method: 'POST', body: orderPayload(sessions.urdCustomer.id, { promoApplied: String(platform._id) }) });
            assert.equal(order.status, 201);
            assert.equal(order.body.discountAmount, 25);
            const accepted = await call('rdVendor', `/api/orders/vendor-accept/${order.body._id}`, { method: 'POST', body: {} });
            assert.equal(accepted.status, 200);
            assert.equal(accepted.body.discountAmount, 25);
        });
    });
});

// Reproduce the missing invoice settings observed by the read-only app-db audit.
test('incomplete issuer configuration blocks checkout before accepting money', async () => {
    const configs = mongoose.connection.collection('systemconfigs');
    const previous = await configs.findOne({ key: 'invoice_settings' });
    await configs.updateOne({ key: 'invoice_settings' }, { $set: { value: { businessName: 'Spinzyt Test' } } });
    try {
        const response = await call('rdCustomer', '/api/orders', { method: 'POST', body: orderPayload(sessions.rdCustomer.id) });
        assert.equal(response.status, 503);
        assert.match(response.body.message, /invoice|address|SAC/i);
    } finally { await configs.updateOne({ key: 'invoice_settings' }, { $set: { value: previous.value } }); }
});

// Exercise the exact key posted by Admin > Pricing Configuration.
test('admin GST control updates the fee GST used by customer checkout', async () => {
    const response = await api(env.baseUrl, '/api/admin/config', { method: 'POST', token: tokenFor('Admin'), body: { key: 'gst_percentage', value: 12 } });
    assert.equal(response.status, 200);
    try {
        const quote = await call('rdCustomer', '/api/orders/quote', { method: 'POST', body: orderPayload(sessions.rdCustomer.id) });
        assert.equal(quote.status, 200);
        assert.equal(quote.body.priceBreakdown.feeGstPercent, 12);
    } finally {
        await mongoose.connection.collection('systemconfigs').deleteOne({ key: 'gst_percentage' });
        await mongoose.connection.collection('systemconfigs').updateOne({ key: 'gst_percent' }, { $set: { value: 18 } });
    }
});


test('authenticated sockets join their own room and cannot join another vendor room', async () => {
    const client = io(env.baseUrl, { transports: ['websocket'], auth: { token: sessions.rdVendor.token }, reconnection: false, timeout: 3000 });
    try {
        await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
        const join = room => new Promise(resolve => client.emit('join_room', room, resolve));
        assert.equal((await join(`user_${sessions.rdVendor.id}`)).ok, true);
        assert.equal((await join(`user_${sessions.urdVendor.id}`)).ok, false);
        assert.equal((await join('admins_pool')).ok, false);
    } finally { client.disconnect(); }
});

test('pending cashback is repaired once and stale acceptance cannot re-credit a cancelled order', async () => {
    const { reconcilePromotionWallets, settlePromotionWallet } = await import('../../src/services/promotionWallet.js');
    const User = (await import('../../src/models/User.js')).default;
    const Order = (await import('../../src/models/Order.js')).default;
    await withPromotion({}, async () => {
        const before = (await User.findById(sessions.urdCustomer.id)).walletBalance;
        const order = await createOrder('urdCustomer');
        const accepted = await call('rdVendor', `/api/orders/vendor-accept/${order._id}`, { method: 'POST', body: {} });
        assert.equal(accepted.status, 200);
        await User.updateOne({ _id: sessions.urdCustomer.id }, { $inc: { walletBalance: -50 }, $pull: { creditedPromotionOrders: order._id } });
        await Order.updateOne({ _id: order._id }, { $set: { walletCreditStatus: 'PENDING' } });
        await reconcilePromotionWallets();
        await reconcilePromotionWallets();
        assert.equal((await User.findById(sessions.urdCustomer.id)).walletBalance, before + 50);
        assert.equal((await call('urdCustomer', `/api/orders/cancel/${order._id}`, { method: 'POST', body: {} })).status, 200);
        await settlePromotionWallet(await Order.hydrate(accepted.body));
        await reconcilePromotionWallets();
        assert.equal((await User.findById(sessions.urdCustomer.id)).walletBalance, before);
    });
});

test('a stale invoice finalization lock is recoverable', async () => {
    const Order = (await import('../../src/models/Order.js')).default;
    const order = await createOrder('rdCustomer');
    assert.equal((await call('rdVendor', `/api/orders/vendor-accept/${order._id}`, { method: 'POST', body: {} })).status, 200);
    await Order.updateOne({ _id: order._id }, { $set: { invoiceFinalizationStatus: 'FINALIZING', invoiceFinalizationStartedAt: new Date(Date.now() - 600000) } });
    const result = await call('rdVendor', `/api/orders/status/${order._id}`, { method: 'PATCH', body: { status: 'DELIVERED' } });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.invoiceFinalizationStatus, 'FINALIZED');
});

test('mismatched draft financials cannot be finalized', async () => {
    const Order = (await import('../../src/models/Order.js')).default;
    const order = await createOrder('rdCustomer');
    assert.equal((await call('rdVendor', `/api/orders/vendor-accept/${order._id}`, { method: 'POST', body: {} })).status, 200);
    await Order.updateOne({ _id: order._id }, { $inc: { 'invoices.customerInvoice.totalAmount': 1 } });
    const result = await call('rdVendor', `/api/orders/status/${order._id}`, { method: 'PATCH', body: { status: 'DELIVERED' } });
    assert.equal(result.status, 503);
    assert.match(result.body.message, /reconcile/);
});


test('new master services inherit configured GST and preserve an explicit zero rate', async () => {
    const Category = (await import('../../src/models/Category.js')).default;
    const category = await Category.create({ mainCategory: 'GST', subCategory: 'Audit' });
    const create = body => api(env.baseUrl, '/api/master-services', { token: tokenFor('Admin'), method: 'POST', body: { categoryId: String(category._id), basePrice: 100, discountedPrice: 100, unit: 'per_item', ...body } });
    const inherited = await create({ itemName: 'GST default rate' });
    assert.equal(inherited.status, 201, JSON.stringify(inherited.body));
    assert.equal(inherited.body.gst, 18);
    assert.equal(inherited.body.heritageGst, 18);
    const zero = await create({ itemName: 'GST zero rate', gst: 0, heritageGst: 0 });
    assert.equal(zero.status, 201, JSON.stringify(zero.body));
    assert.equal(zero.body.gst, 0);
    assert.equal(zero.body.heritageGst, 0);
});

test('customers and unapproved vendors cannot accept service orders', async () => {
    const User = (await import('../../src/models/User.js')).default;
    const order = await createOrder('rdCustomer');
    assert.equal((await call('rdCustomer', `/api/orders/vendor-accept/${order._id}`, { method: 'POST', body: {} })).status, 403);
    await User.updateOne({ _id: sessions.rdVendor.id }, { $set: { status: 'pending' } });
    try {
        assert.equal((await call('rdVendor', `/api/orders/vendor-accept/${order._id}`, { method: 'POST', body: {} })).status, 403);
    } finally { await User.updateOne({ _id: sessions.rdVendor.id }, { $set: { status: 'approved' } }); }
});

test('pricing preview and area synchronization use configured GST and preserve zero rates', async () => {
    const MasterService = (await import('../../src/models/MasterService.js')).default;
    const Category = (await import('../../src/models/Category.js')).default;
    const ServiceArea = (await import('../../src/models/ServiceArea.js')).default;
    const MasterPricing = (await import('../../src/models/MasterPricing.js')).default;
    const { masterPricingService } = await import('../../src/services/masterPricingService.js');
    const configs = mongoose.connection.collection('systemconfigs');
    const category = await Category.create({ mainCategory: 'GST Preview', subCategory: 'Configured rate' });
    const area = await ServiceArea.create({ areaName: 'GST preview test', boundary: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } });
    const services = await MasterService.create([
        { itemName: 'Preview inherited GST', categoryId: category._id, basePrice: 100, discountedPrice: 100, unit: 'per_item' },
        { itemName: 'Preview zero GST', categoryId: category._id, basePrice: 100, discountedPrice: 100, unit: 'per_item', gst: 0 }
    ]);
    try {
        // Deliberately stale legacy key must not override the canonical setting.
        await configs.updateOne({ key: 'gst_percentage' }, { $set: { value: 18 } }, { upsert: true });
        for (const rate of [12, 0]) {
            await configs.updateOne({ key: 'gst_percent' }, { $set: { value: rate } });
            await masterPricingService.syncAreaWithServices(area._id);
            const rows = await MasterPricing.find({ fenceId: area._id }).lean();
            assert.equal(rows.find(row => String(row.serviceId) === String(services[0]._id)).gstPercent, rate);
            assert.equal(rows.find(row => String(row.serviceId) === String(services[1]._id)).gstPercent, 0);
            const response = await api(env.baseUrl, `/api/master-services/preview?area_id=${area._id}&category_id=${category._id}`);
            assert.equal(response.status, 200, JSON.stringify(response.body));
            const inherited = response.body.find(row => row.serviceId === String(services[0]._id));
            const zero = response.body.find(row => row.serviceId === String(services[1]._id));
            assert.equal(inherited.gst, `${rate}%`);
            assert.equal(inherited.finalPrice, Math.round(170 * (1 + rate / 100)));
            assert.equal(zero.gst, '0%');
            assert.equal(zero.finalPrice, Math.round(170 + 70 * rate / 100));
        }
    } finally {
        await configs.updateOne({ key: 'gst_percent' }, { $set: { value: 18 } });
        await configs.deleteOne({ key: 'gst_percentage' });
        await MasterPricing.deleteMany({ fenceId: area._id });
        await MasterService.deleteMany({ _id: { $in: services.map(service => service._id) } });
        await ServiceArea.deleteOne({ _id: area._id });
        await Category.deleteOne({ _id: category._id });
    }
});
