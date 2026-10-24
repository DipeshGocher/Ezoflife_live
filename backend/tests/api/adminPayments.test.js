/**
 * Admin payments and supplier ratings: every figure is computed from
 * seeded database records, and actions that move money or identity are guarded.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';

const DAY = 86400000;
const HOUR = 3600000;
const ago = (ms) => new Date(Date.now() - ms);
const ymd = (d) => d.toISOString().slice(0, 10);

let env, admin, db;
const ids = {};
const oid = () => new mongoose.Types.ObjectId();

before(async () => {
    env = await startTestEnvironment();
    admin = tokenFor('Admin');
    await mongoose.connect(env.mongoUri);
    db = mongoose.connection.db;
    Object.assign(ids, { v: oid(), v2: oid(), c1: oid(), c2: oid(), c3: oid(), sup: oid(), sup2: oid() });

    await db.collection('users').insertMany([
        { _id: ids.v, role: 'Vendor', phone: '9500000001', displayName: 'Fresh Wash', status: 'approved', bankDetails: { accountNumber: '123456789012', bankName: 'HDFC' } },
        { _id: ids.v2, role: 'Vendor', phone: '9500000002', displayName: 'Other Vendor', status: 'approved' },
        { _id: ids.c1, role: 'Customer', phone: '9500000011', displayName: 'Asha' },
        { _id: ids.c2, role: 'Customer', phone: '9500000012', displayName: 'Ravi' },
        { _id: ids.c3, role: 'Customer', phone: '9500000013', displayName: 'Meera' },
        { _id: ids.sup, role: 'Supplier', phone: '9500000021', displayName: 'Acme Supplies', status: 'approved' },
        { _id: ids.sup2, role: 'Supplier', phone: '9500000022', displayName: 'Unrated Supplies', status: 'approved' }
    ]);

    const t0 = ago(5 * DAY);
    let n = 0;
    const order = (o) => ({
        orderId: `RP-${n++}`, vendor: ids.v, paymentMethod: 'COD', paymentStatus: 'Paid',
        priceBreakdown: { baseWithArea: 0 }, createdAt: ago(2 * DAY), updatedAt: ago(2 * DAY), ...o
    });
    await db.collection('orders').insertMany([
        // TAT: delivered with a full timeline (30h end-to-end, 8h processing at the vendor)
        order({ customer: ids.c1, status: 'DELIVERED', totalAmount: 500, createdAt: t0,
            priceBreakdown: { baseWithArea: 400 },
            pickupLocation: { lat: 22.7196, lng: 75.8577 }, pickupAddress: '12 MG Road, Indore 452001',
            statusHistory: [
                { status: 'ORDER_PLACED', timestamp: t0 },
                { status: 'RECEIVED_BY_VENDOR', timestamp: new Date(t0.getTime() + 2 * HOUR) },
                { status: 'READY_FOR_DISPATCH', timestamp: new Date(t0.getTime() + 10 * HOUR) },
                { status: 'DELIVERED', timestamp: new Date(t0.getTime() + 30 * HOUR) }
            ] }),
        // Delivered, but no recorded timeline
        order({ customer: ids.c1, status: 'DELIVERED', totalAmount: 300, pickupLocation: { lat: 22.7196, lng: 75.8577 }, pickupAddress: 'Near park, 452001' }),
        // Delivered but unpaid
        order({ customer: ids.c1, status: 'DELIVERED', paymentStatus: 'Pending', totalAmount: 150, pickupLocation: { lat: 22.75, lng: 75.89 }, pickupAddress: 'Vijay Nagar 452010' }),
        // Platform- and vendor-funded discounts
        order({ customer: ids.c2, status: 'PROCESSING', totalAmount: 400, discountAmount: 50, ledger: { promoOwnerType: 'PLATFORM' } }),
        order({ customer: ids.c3, status: 'PROCESSING', totalAmount: 100, discountAmount: 20, ledger: { promoOwnerType: 'VENDOR' } }),
        // Cancelled, and cancelled + refunded (online, partly from wallet)
        order({ customer: ids.c2, status: 'CANCELLED', paymentStatus: 'Pending', totalAmount: 300 }),
        order({ customer: ids.c2, status: 'CANCELLED', paymentStatus: 'Refunded', paymentMethod: 'Online', totalAmount: 200, walletAmountDeducted: 50, razorpayPaymentId: 'pay_REAL123' })
    ]);

    const b2b = (o) => ({
        vendor: ids.v, supplier: ids.sup, cycleId: 'C', deliveryDay: 'Sunday', deliveryDate: new Date(), items: [],
        totalAmount: 1000, platformFee: 0, paymentStatus: 'Paid', escrowStatus: 'Held', createdAt: ago(2 * DAY), updatedAt: ago(2 * DAY), ...o
    });
    await db.collection('b2borders').insertMany([
        b2b({ _id: (ids.bDelivered = oid()), b2bOrderId: 'B2B-RP-1', status: 'DELIVERED' }),
        b2b({ _id: (ids.bSubmitted = oid()), b2bOrderId: 'B2B-RP-2', status: 'SUBMITTED' }),
        b2b({ _id: (ids.bOther = oid()), b2bOrderId: 'B2B-RP-3', status: 'DELIVERED', vendor: ids.v2 }),
        b2b({ b2bOrderId: 'B2B-RP-4', status: 'PENDING_PAYMENT', paymentStatus: 'Pending', platformFee: 25 })
    ]);
}, { timeout: 90000 });

after(async () => {
    await mongoose.disconnect().catch(() => {});
    if (env) await env.stop();
});

describe('payments use real records', () => {
    test('refund ledger lists the actual refund with wallet/online split', async () => {
        const res = await api(env.baseUrl, '/api/admin/refunds', { token: admin });
        assert.equal(res.status, 200);
        assert.equal(res.body.summary.count, 1);
        const r = res.body.refunds[0];
        assert.equal(r.amount, 200);
        assert.equal(r.walletRefund, 50);
        assert.equal(r.onlineRefund, 150);
        assert.equal(r.paymentReference, 'pay_REAL123');
    });

    test('customer payments exclude cancelled orders', async () => {
        const res = await api(env.baseUrl, '/api/admin/customer-payments', { token: admin });
        const ravi = res.body.find(c => c.phone === '9500000012');
        assert.equal(ravi.totalOrders, 1);
        assert.equal(ravi.cancelledOrders, 2);
        assert.equal(ravi.totalSpent, 350);
        assert.equal(ravi.refundedOrders, 1);
    });

    test('vendor refund totals use the recorded refund, not the undiscounted order total', async () => {
        const filter = { razorpayPaymentId: 'pay_REAL123' };
        await db.collection('orders').updateOne(filter, { $set: { refundAmount: 125, walletRefundAmount: 50, onlineRefundAmount: 75 } });
        try {
            const result = await api(env.baseUrl, '/api/admin/vendor-payments', { token: admin });
            assert.equal(result.body.find(v => v.phone === '9500000001').totalRefund, 125);
            const ledger = await api(env.baseUrl, '/api/admin/refunds', { token: admin });
            assert.equal(ledger.body.refunds[0].amount, 125);
        } finally {
            await db.collection('orders').updateOne(filter, { $unset: { refundAmount: '', walletRefundAmount: '', onlineRefundAmount: '' } });
        }
    });

    test('wallet and mixed paid orders do not create phantom customer debt; COD remains unpaid', async () => {
        const customerId = oid();
        await db.collection('users').insertOne({ _id: customerId, role: 'Customer', phone: '9500000099', displayName: 'Accounting regression' });
        await db.collection('orders').insertMany([
            { customer: customerId, orderId: 'CALC-WALLET', status: 'ORDER_PLACED', totalAmount: 100.25, paymentMethod: 'Wallet', paymentStatus: 'Paid', walletAmountDeducted: 100.25, advanceAmount: 0, dueAmount: 0 },
            { customer: customerId, orderId: 'CALC-MIXED', status: 'ORDER_PLACED', totalAmount: 200, checkoutDiscountAmount: 20, paymentMethod: 'Online', paymentStatus: 'Paid', walletAmountDeducted: 30, advanceAmount: 150, dueAmount: 0 },
            { customer: customerId, orderId: 'CALC-COD', status: 'ORDER_PLACED', totalAmount: 50, paymentMethod: 'COD', paymentStatus: 'Pending', advanceAmount: 0, dueAmount: 50 },
        ]);
        const res = await api(env.baseUrl, '/api/admin/customer-payments', { token: admin });
        const row = res.body.find(c => c.phone === '9500000099');
        assert.equal(row.totalSpent, 330.25);
        assert.equal(row.totalPaid, 280.25);
        assert.equal(row.pendingBalance, 50);
        await db.collection('orders').deleteMany({ customer: customerId });
        await db.collection('users').deleteOne({ _id: customerId });
    });

    test('vendor payouts: real bank account, refunds and settlement date from the configured cycle', async () => {
        await api(env.baseUrl, '/api/admin/config', { method: 'POST', token: admin, body: { key: 'vendor_settlement_cycle', value: 'Weekly' } });
        let res = await api(env.baseUrl, '/api/admin/vendor-payments', { token: admin });
        let v = res.body.find(x => x.phone === '9500000001');
        assert.equal(v.bankAccount, 'HDFC ···· 9012');
        assert.equal(v.razorpayPayoutId, null);
        assert.equal(v.totalRefund, 200);
        assert.equal(v.settlementCycle, 'Weekly');
        assert.ok(v.pendingBalance > 0);
        assert.ok(v.settlementDate, 'a vendor who is owed money gets a settlement date');

        await api(env.baseUrl, '/api/admin/config', { method: 'POST', token: admin, body: { key: 'vendor_settlement_cycle', value: 'Manual' } });
        res = await api(env.baseUrl, '/api/admin/vendor-payments', { token: admin });
        v = res.body.find(x => x.phone === '9500000001');
        assert.equal(v.settlementDate, null);
        assert.equal(res.body.find(x => x.phone === '9500000002').bankAccount, null);
    });

    test('recording a payout rejects non-positive amounts', async () => {
        const res = await api(env.baseUrl, '/api/admin/record-vendor-payout', {
            method: 'POST', token: admin, body: { vendorId: ids.v.toString(), amount: -5, transactionId: 'UTR1' }
        });
        assert.equal(res.status, 400);
    });

    test('supplier funds are released only for delivered orders, once', async () => {
        const release = id => api(env.baseUrl, `/api/b2b-orders/${id}/release`, { method: 'PATCH', token: admin });
        assert.equal((await release(ids.bSubmitted)).status, 400);
        assert.equal((await release(ids.bDelivered)).status, 200);
        assert.equal((await release(ids.bDelivered)).status, 400);
    });
});

describe('supplier ratings come from vendors who received the goods', () => {
    const rate = (orderId, token, body) =>
        api(env.baseUrl, `/api/b2b-orders/${orderId}/rate-supplier`, { method: 'POST', token, body });

    test('only the ordering vendor, only after delivery, only 1–5', async () => {
        const vendorToken = tokenFor('Vendor', ids.v.toString());
        assert.equal((await rate(ids.bSubmitted, vendorToken, { rating: 4 })).status, 400, 'not delivered yet');
        assert.equal((await rate(ids.bOther, vendorToken, { rating: 4 })).status, 403, 'another vendor\'s order');
        assert.equal((await rate(ids.bOther, tokenFor('Vendor', ids.v2.toString()), { rating: 6 })).status, 400, 'out of range');
        assert.equal((await rate(ids.bOther, vendorToken, { rating: 5 })).status, 403);
    });

    test('ratings are averaged and shown to admins; unrated suppliers stay unrated', async () => {
        // bDelivered was settled above (still rateable); bOther rated by its own vendor
        assert.equal((await rate(ids.bDelivered, tokenFor('Vendor', ids.v.toString()), { rating: 5, comment: 'On time' })).status, 200);
        assert.equal((await rate(ids.bOther, tokenFor('Vendor', ids.v2.toString()), { rating: 2 })).status, 200);

        const users = await api(env.baseUrl, '/api/admin/users?role=Supplier', { token: admin });
        const acme = users.body.find(u => u.phone === '9500000021');
        const unrated = users.body.find(u => u.phone === '9500000022');
        assert.equal(acme.avgRating, 3.5);
        assert.equal(acme.ratingCount, 2);
        assert.equal(unrated.avgRating, null);

        const dash = await api(env.baseUrl, '/api/admin/dashboard-analytics', { token: admin });
        const ratings = dash.body.data.supplierAnalytics.scatterData.map(s => s.rating).sort();
        assert.deepEqual(ratings, [3.5, null].sort());
    });

    test('re-rating updates instead of double counting', async () => {
        assert.equal((await rate(ids.bOther, tokenFor('Vendor', ids.v2.toString()), { rating: 4 })).status, 200);
        const users = await api(env.baseUrl, '/api/admin/users?role=Supplier', { token: admin });
        const acme = users.body.find(u => u.phone === '9500000021');
        assert.equal(acme.avgRating, 4.5);
        assert.equal(acme.ratingCount, 2);
    });
});
