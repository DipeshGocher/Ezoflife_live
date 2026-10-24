import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { api, startTestEnvironment } from '../helpers/testEnvironment.js';
import { createUser } from '../helpers/factories.js';
import B2BOrder from '../../src/models/B2BOrder.js';

const round = value => Math.round(value * 100) / 100;

let env;
let supplier;
let vendor;

before(async () => {
    env = await startTestEnvironment();
    supplier = await createUser(api, env.baseUrl, '9990008201', 'Supplier');
    vendor = await createUser(api, env.baseUrl, '9990008202', 'Vendor');
    await mongoose.connect(env.mongoUri);

    const base = {
        vendor: vendor.id,
        supplier: supplier.id,
        cycleId: 'TEST-CYCLE',
        deliveryDay: 'Monday',
        deliveryDate: new Date(),
        shippingAddress: 'Test Vendor, Indore',
        pincode: '452001',
        city: 'Indore'
    };

    await B2BOrder.create([
        {
            ...base,
            items: [{ name: 'Detergent', quantity: 1, price: 118, costPrice: 60, gst: 18 }],
            totalAmount: 118,
            status: 'DELIVERED',
            paymentStatus: 'Paid',
            escrowStatus: 'Released'
        },
        {
            ...base,
            items: [{ name: 'Cancelled Product', quantity: 1, price: 59 }],
            totalAmount: 59,
            status: 'CANCELLED'
        },
        {
            ...base,
            items: [{ name: 'Unpaid Fee Order', quantity: 1, price: 500 }],
            totalAmount: 500,
            status: 'PENDING_PAYMENT'
        },
        {
            ...base,
            items: [{ name: 'Exempt Grain', quantity: 2, price: 50, costPrice: 30, gst: 0 }],
            totalAmount: 100,
            status: 'DELIVERED'
        },
        {
            ...base,
            items: [{ name: 'Detergent', quantity: 1, price: 236, costPrice: 120, gst: 18 }],
            totalAmount: 236,
            status: 'ACCEPTED'
        }
    ]);
}, { timeout: 90000 });

after(async () => {
    await mongoose.disconnect().catch(() => {});
    if (env) await env.stop();
});

describe('supplier business insights', () => {
    test('requires authentication and supplier role', async () => {
        assert.equal((await api(env.baseUrl, '/api/b2b-orders/supplier/insights')).status, 401);
        assert.equal((await api(env.baseUrl, '/api/b2b-orders/supplier/insights', { token: vendor.token })).status, 403);
    });

    test('returns supplier-scoped revenue, net sales, GST and fulfillment metrics', async () => {
        const res = await api(env.baseUrl, '/api/b2b-orders/supplier/insights', { token: supplier.token });
        assert.equal(res.status, 200);
        const { kpis } = res.body;
        assert.equal(kpis.grossRevenue, 454, 'cancelled and unpaid-fee orders are excluded from revenue');
        assert.equal(kpis.netSales, 400, '0% GST items are not taxed at a default 18%');
        assert.equal(kpis.gstCollected, 54);
        assert.equal(kpis.estimatedGrossProfit, 400 - 60 - 60 - 120);
        assert.equal(kpis.profitCoverageComplete, true);
        assert.equal(kpis.released, 118, 'released escrow counts as settled');
        assert.equal(kpis.receivable, 100, 'only delivered, unsettled orders are receivable');
        assert.equal(kpis.inPipeline, 236, 'accepted but undelivered orders are pipeline, not receivable');
        assert.equal(kpis.totalOrders, 4, 'unpaid-fee orders were never placed');
        assert.equal(kpis.billableOrders, 3);
        assert.equal(kpis.completedOrders, 2);
        assert.equal(kpis.completionRate, 50);
        assert.equal(kpis.averageOrderValue, round(454 / 3));
        assert.ok(!res.body.statusBreakdown.some(row => row.name === 'PENDING_PAYMENT'));
        assert.equal(res.body.topProducts[0].name, 'Detergent');
        assert.equal(res.body.topProducts[0].revenue, 354);
    });
});
