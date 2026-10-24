/**
 * Admin Dashboard analytics accuracy.
 *
 * Seeds a known dataset (raw inserts so createdAt can be back-dated) and checks
 * each number the dashboard shows against the true answer. Guards against:
 *  - location filters silently restricting to users who signed up in the period
 *  - totals (clients, wallet liability, vendors) counting only new sign-ups
 *  - explicit date windows (">24h", "prior period") being overwritten
 *  - wrong schema field names making catalog counts always 0
 *  - unpaid supply orders counted as revenue
 *  - invented values (supplier rating 5.0, hardcoded states)
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';

const DAY = 86400000;
const ago = (ms) => new Date(Date.now() - ms);
let env, admin;

before(async () => {
    env = await startTestEnvironment();
    admin = tokenFor('Admin');
    await mongoose.connect(env.mongoUri);
    const db = mongoose.connection.db;
    const oid = () => new mongoose.Types.ObjectId();

    const indore = { city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' };
    const [c1, c2, c3, c4, c5, v1, v2] = [oid(), oid(), oid(), oid(), oid(), oid(), oid()];
    const customer = (_id, phone, createdAt, wallet, addr = indore) =>
        ({ _id, role: 'Customer', phone, walletBalance: wallet, addresses: [addr], createdAt, updatedAt: createdAt });

    await db.collection('users').insertMany([
        customer(c1, '9300000001', ago(90 * DAY), 100),
        { ...customer(c2, '9300000002', ago(90 * DAY), 100), customerType: 'retail', gstNumber: '23ABCDE1234F1Z5' },
        customer(c3, '9300000003', ago(90 * DAY), 100),
        customer(c4, '9300000004', ago(3 * DAY), 50),
        customer(c5, '9300000005', ago(90 * DAY), 0, { city: 'Pune', state: 'Maharashtra', pincode: '411001' }),
        { _id: v1, role: 'Vendor', phone: '9310000001', status: 'approved', shopDetails: indore, createdAt: ago(90 * DAY), updatedAt: ago(90 * DAY) },
        { _id: v2, role: 'Vendor', phone: '9310000002', status: 'approved', shopDetails: indore, createdAt: ago(90 * DAY), updatedAt: ago(90 * DAY) },
        { role: 'Supplier', phone: '9320000001', supplierDetails: { businessName: 'Acme' }, createdAt: ago(90 * DAY), updatedAt: ago(90 * DAY) }
    ]);

    let n = 0;
    const order = (customerId, status, totalAmount, createdAt, platformFee = 0) => ({
        orderId: `DASH-${n++}`, customer: customerId, vendor: v1, status, paymentStatus: 'Paid', totalAmount,
        priceBreakdown: { platformFee, logisticsFee: 0 }, createdAt, updatedAt: createdAt
    });
    await db.collection('orders').insertMany([
        order(c1, 'DELIVERED', 500, ago(3 * DAY), 50),
        order(c2, 'DELIVERED', 500, ago(3 * DAY), 50),
        order(c5, 'DELIVERED', 300, ago(3 * DAY)),          // Pune
        order(c3, 'ORDER_PLACED', 100, ago(2 * DAY)),       // waiting > 24h
        order(c3, 'ORDER_PLACED', 100, ago(60 * 60 * 1000)),// waiting ~1h
        order(c1, 'DELIVERED', 400, ago(40 * DAY))          // previous period
    ]);

    const b2b = (vendor, status, totalAmount, platformFee, b2bOrderId) => ({
        vendor, status, totalAmount, platformFee, b2bOrderId, city: 'Indore', pincode: '452001',
        cycleId: 'C', deliveryDay: 'Sunday', deliveryDate: new Date(Date.now() + 5 * DAY),
        items: [], createdAt: ago(3 * DAY), updatedAt: ago(3 * DAY)
    });
    await db.collection('b2borders').insertMany([
        b2b(v1, 'SUBMITTED', 800, 40, 'B2B-DASH-1'),
        b2b(v2, 'PENDING_PAYMENT', 999, 50, 'B2B-DASH-2') // unpaid: not revenue, not "ordered"
    ]);

    await db.collection('masterservices').insertMany([
        { name: 'Wash', isActive: true }, { name: 'Iron', isActive: true }, { name: 'Dry Clean', isActive: false }
    ]);
    await db.collection('vendormastersupplies').insertMany([
        { materialName: 'Soap', skuId: 'DASH-1', isActive: 'y', approvalStatus: 'Approved' },
        { materialName: 'Bleach', skuId: 'DASH-2', isActive: 'n', approvalStatus: 'Pending' }
    ]);
    await db.collection('serviceareas').insertOne({ areaName: 'Bhopal Central', city: 'Bhopal', pincodes: ['462001'] });
}, { timeout: 90000 });

after(async () => {
    await mongoose.disconnect().catch(() => {});
    if (env) await env.stop();
});

const analytics = async (qs = '') => {
    const res = await api(env.baseUrl, `/api/admin/dashboard-analytics?timeRange=Last%2030%20Days${qs}`, { token: admin });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.data;
};

describe('admin dashboard: totals use every record, not only new sign-ups', () => {
    let d;
    before(async () => { d = await analytics(); });

    test('"Unique clients" counts all customers', () => assert.equal(d.customerAnalytics.totalCustomers, 5));
    test('wallet liability sums every customer balance', () => assert.equal(d.financials.walletLiability, 350));
    test('churn risk = customers with no order in 30 days', () => assert.equal(d.customerAnalytics.churnRisk, 1));
    test('dormant vendors = approved vendors with no recent orders', () => assert.equal(d.vendorPerformance.dormantCount, 1));
    test('vendors who never placed a (paid) supply order', () => assert.equal(d.vendorPerformance.neverOrderedB2B, 1));
});

describe('admin dashboard: revenue', () => {
    test('gross revenue includes paid supply orders but not unpaid ones', async () => {
        const d = await analytics();
        assert.equal(d.financials.grossRevenue, 1500 + 800);
        assert.equal(d.financials.b2bRevenue, 800);
        assert.equal(d.financials.netProfit, 100 + 40);
        assert.equal(d.financials.b2b.supplierOrderValue, 800);
        assert.equal(d.financials.b2b.directSupplierPayable, 800);
        assert.equal(d.financials.b2b.platformFeesRaised, 90);
        assert.equal(d.financials.b2b.platformFeesCollected, 40);
        assert.equal(d.financials.b2b.platformFeesPending, 50);
    });

    test('trend compares with the previous period of equal length', async () => {
        const d = await analytics();
        assert.equal(d.financials.trendMoM, '+475.0%'); // 2300 vs 400
    });

    test('channel filter', async () => {
        const b2c = await analytics('&channel=B2C');
        const b2b = await analytics('&channel=B2B');
        assert.equal(b2c.financials.grossRevenue, 1000, 'B2C contains individual-customer service orders only');
        assert.equal(b2b.financials.grossRevenue, 1300, 'B2B combines business-customer services and supply orders');
        assert.equal(b2b.financials.b2b.businessCustomerOrderValue, 500);
        assert.equal(b2b.financials.b2b.supplierOrderValue, 800);
        assert.equal(b2b.financials.netProfit, 90, 'B2B platform revenue combines service margin and collected supply fees');
        assert.equal(b2b.customerAnalytics.totalCustomers, 1);
        assert.equal(b2c.customerAnalytics.totalCustomers, 4);
    });

    test('overview separates active B2C, active B2B and fee-pending orders', async () => {
        const d = await analytics();
        assert.equal(d.overview.activeB2COrders, 2);
        assert.equal(d.overview.activeB2BOrders, 1);
        assert.equal(d.overview.awaitingB2BPlatformFee, 1);
    });

    test('financial trend uses the selected period instead of a fixed six-month window', async () => {
        const res = await api(env.baseUrl, '/api/admin/dashboard-analytics?timeRange=Today', { token: admin });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.data.monthlyTrend.length, 1);
    });
});

describe('admin dashboard: location filters include existing customers', () => {
    let d;
    before(async () => { d = await analytics('&city=Indore'); });

    test('revenue for Indore', () => assert.equal(d.financials.grossRevenue, 1200 + 800));
    test('orders for Indore', () => assert.equal(d.orderLifecycleB2C.totalSubmitted, 4));
    test('clients in Indore', () => assert.equal(d.customerAnalytics.totalCustomers, 4));

    test('state filter', async () => {
        const mh = await analytics('&state=Maharashtra');
        assert.equal(mh.customerAnalytics.totalCustomers, 1);
        assert.equal(mh.orderLifecycleB2C.totalSubmitted, 1);
    });
});

describe('admin dashboard: explicit time windows are respected', () => {
    test('critical timeouts only count orders waiting more than 24h', async () => {
        const d = await analytics();
        assert.equal(d.orderLifecycleB2C.criticalTimeouts, 1);
        assert.equal(d.orderLifecycleB2C.immediateTimeouts, 2);
    });

    test('unpaid supply orders are not "placed"', async () => {
        assert.equal((await analytics()).orderLifecycleB2B.totalPlaced, 1);
    });
});

describe('admin dashboard: catalog counts use real schema fields', () => {
    let d;
    before(async () => { d = await analytics(); });

    test('services active / inactive', () => {
        // 2 seeded here + the active fixture service every test environment has
        assert.equal(d.catalogB2C.totalServices, 3);
        assert.equal(d.catalogB2C.inactiveServices, 1);
    });
    test('supply products active / inactive / pending review', () => {
        assert.equal(d.catalogB2B.totalProducts, 1);
        assert.equal(d.catalogB2B.inactiveProducts, 0, 'pending products are reviews, not inactive approved SKUs');
        assert.equal(d.catalogB2B.pendingReviews, 1);
    });
});

describe('admin dashboard: nothing is invented', () => {
    test('supplier with no rating is reported as null, not 5.0', async () => {
        const d = await analytics();
        assert.equal(d.supplierAnalytics.scatterData[0].rating, null);
    });

    test('state filter options come only from real addresses', async () => {
        const res = await api(env.baseUrl, '/api/admin/dashboard-analytics/filters', { token: admin });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.data.states, ['Madhya Pradesh', 'Maharashtra']);
        assert.deepEqual(res.body.data.stateCityMap['Maharashtra'], ['Pune']);
        // Bhopal only exists as a geofence with no recorded state: not guessed into a state
        assert.deepEqual(res.body.data.unmappedCities, ['Bhopal']);
        assert.ok(!res.body.data.stateCityMap['Madhya Pradesh'].includes('Bhopal'));
    });

    test('non-admins cannot read analytics', async () => {
        const res = await api(env.baseUrl, '/api/admin/dashboard-analytics', { token: tokenFor('Vendor') });
        assert.equal(res.status, 403);
    });
});
