import User from '../../src/models/User.js';
/**
 * Vendor Business Insights: every number comes from the vendor's own orders
 * and feedback for the selected range (the page previously showed hardcoded
 * charts, made-up clients and ₹0 cards).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';

const DAY = 86400000;
const ago = (ms) => new Date(Date.now() - ms);
const ymd = (d) => d.toISOString().slice(0, 10);

let env;
const ids = {};

before(async () => {
    env = await startTestEnvironment();
    await mongoose.connect(env.mongoUri);
    const db = mongoose.connection.db;
    const oid = () => new mongoose.Types.ObjectId();
    Object.assign(ids, { v: oid(), v2: oid(), c1: oid(), c2: oid() });

    await db.collection('users').insertMany([
        { _id: ids.v, role: 'Vendor', phone: '9400000001', status: 'approved' },
        { _id: ids.v2, role: 'Vendor', phone: '9400000002', status: 'approved' },
        { _id: ids.c1, role: 'Customer', phone: '9400000011', displayName: 'Asha', customerType: 'individual' },
        { _id: ids.c2, role: 'Customer', phone: '9400000012', displayName: 'Ravi', customerType: 'retail', businessName: 'Grand Hotel', gstNumber: '23ABCDE1234F1Z5' }
    ]);

    let n = 0;
    const order = (vendor, customer, status, totalAmount, gstAmount, createdAt, extra = {}) => ({
        orderId: `INS-${n++}`, vendor, customer, status, totalAmount, createdAt, updatedAt: createdAt,
        priceBreakdown: { gstAmount, baseWithArea: 0, ...(extra.priceBreakdown || {}) },
        items: extra.items || [], ledger: extra.ledger || {}
    });
    await db.collection('orders').insertMany([
        order(ids.v, ids.c1, 'DELIVERED', 590, 90, ago(2 * DAY), { priceBreakdown: { baseWithArea: 400 }, items: [{ name: 'Wash & Fold', price: 200, quantity: 2 }] }),
        order(ids.v, ids.c2, 'DELIVERED', 1180, 180, ago(3 * DAY), { ledger: { vendorNetPayout: 800 }, items: [{ name: 'Dry Cleaning', price: 500, quantity: 2 }] }),
        order(ids.v, ids.c1, 'PROCESSING', 236, 36, ago(1 * DAY), { priceBreakdown: { baseWithArea: 150 }, items: [{ name: 'Wash & Fold', price: 100, quantity: 2 }] }),
        order(ids.v, ids.c1, 'CANCELLED', 999, 0, ago(1 * DAY)),
        order(ids.v, ids.c1, 'DELIVERED', 5000, 0, ago(60 * DAY)),   // outside the range
        order(ids.v2, ids.c1, 'DELIVERED', 777, 0, ago(2 * DAY))     // another vendor
    ]);

    await db.collection('feedbacks').insertMany([
        { vendor: ids.v, user: ids.c1, rating: 5, comment: 'Crisp folding, loved it', createdAt: ago(2 * DAY) },
        { vendor: ids.v, user: ids.c1, rating: 2, comment: 'Late pickup again', createdAt: ago(1 * DAY) },
        { vendor: ids.v2, user: ids.c1, rating: 1, comment: 'Poor wash', createdAt: ago(1 * DAY) }
    ]);
}, { timeout: 90000 });

after(async () => {
    await mongoose.disconnect().catch(() => {});
    if (env) await env.stop();
});

const range = `from=${ymd(ago(10 * DAY))}&to=${ymd(new Date())}`;
const insights = (token, qs = range) => api(env.baseUrl, `/api/orders/vendor/insights?${qs}`, { token });

describe('vendor insights are computed from the vendor\'s own data', () => {
    let d;
    before(async () => {
        const res = await insights(tokenFor('Vendor', ids.v.toString()));
        assert.equal(res.status, 200, JSON.stringify(res.body));
        d = res.body;
    });

    test('KPIs exclude cancelled, out-of-range and other vendors\' orders', () => {
        assert.equal(d.kpis.revenue, 2006);
        assert.equal(d.kpis.netEarnings, 1350); // 400 + ledger 800 + 150
        assert.equal(d.kpis.aov, 668.67);
        assert.equal(d.kpis.totalOrders, 4);
        assert.equal(d.kpis.successRate, 66.7); // 2 delivered of 3 closed
    });

    test('status mix', () => {
        const by = Object.fromEntries(d.statusBreakdown.map(s => [s.name, s.count]));
        assert.deepEqual(by, { Completed: 2, 'In Progress': 1, Cancelled: 1 });
    });

    test('trend buckets sum to the KPIs', () => {
        assert.equal(d.range.granularity, 'day');
        assert.equal(Math.round(d.trend.reduce((s, t) => s + t.revenue, 0)), 2006);
        assert.equal(Math.round(d.trend.reduce((s, t) => s + t.earnings, 0)), 1350);
    });

    test('average order value per service', () => {
        const by = Object.fromEntries(d.serviceAov.map(s => [s.name, s.avg]));
        assert.deepEqual(by, { 'Dry Cleaning': 1000, 'Wash & Fold': 300 });
    });

    test('GST ledger and B2B/B2C split use real customer GST details', () => {
        assert.equal(d.ledger.length, 3);
        assert.equal(d.gst.taxable, 1700);
        assert.equal(d.gst.gst, 306);
        assert.equal(d.gst.b2bTaxable, 1000);
        assert.equal(d.gst.b2cOrders, 2);
        assert.deepEqual(d.b2bClients, [{ name: 'Grand Hotel', taxable: 1000 }]);
        const b2b = d.ledger.find(r => r.type === 'B2B');
        assert.equal(b2b.gstin, '23ABCDE1234F1Z5');
        assert.equal(b2b.rate, 18);
        assert.equal(d.b2cMonthly.reduce((s, m) => s + m.orders, 0), 2);
    });

    test('ratings and feedback tags come from real feedback', () => {
        assert.equal(d.feedback.average, 3.5);
        assert.equal(d.feedback.count, 2);
        assert.deepEqual(d.feedback.positive, ['Crisp Folding']);
        assert.deepEqual(d.feedback.critical, ['Late Pickup']);
    });
});

describe('vendor insights: empty and isolated', () => {
    test('another vendor only sees their own numbers', async () => {
        const res = await insights(tokenFor('Vendor', ids.v2.toString()));
        assert.equal(res.body.kpis.revenue, 777);
        assert.equal(res.body.feedback.average, 1);
    });

    test('a vendor with no data gets zeros and nulls, never sample values', async () => {
        const empty = await User.create({ phone: '9876099999', role: 'Vendor', status: 'approved' });
        const res = await insights(tokenFor('Vendor', String(empty._id)));
        assert.equal(res.status, 200);
        assert.equal(res.body.kpis.revenue, 0);
        assert.equal(res.body.kpis.successRate, null);
        assert.equal(res.body.feedback.average, null);
        assert.deepEqual(res.body.b2bClients, []);
        assert.deepEqual(res.body.serviceAov, []);
        assert.deepEqual(res.body.feedback.positive, []);
    });

    test('an admin can view a specific vendor', async () => {
        const res = await insights(tokenFor('Admin'), `${range}&vendorId=${ids.v}`);
        assert.equal(res.body.kpis.revenue, 2006);
    });
});

describe('vendor insights: access and validation', () => {
    test('requires login', async () => {
        assert.equal((await api(env.baseUrl, `/api/orders/vendor/insights?${range}`)).status, 401);
    });

    test('customers are refused', async () => {
        assert.equal((await insights(tokenFor('Customer', ids.c1.toString()))).status, 403);
    });

    test('a vendor cannot read another vendor via ?vendorId', async () => {
        const res = await insights(tokenFor('Vendor', ids.v2.toString()), `${range}&vendorId=${ids.v}`);
        assert.equal(res.body.kpis.revenue, 777);
    });

    test('rejects bad ranges', async () => {
        const token = tokenFor('Vendor', ids.v.toString());
        assert.equal((await insights(token, 'from=not-a-date')).status, 400);
        assert.equal((await insights(token, 'from=2026-05-10&to=2026-05-01')).status, 400);
    });
});
