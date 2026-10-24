import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardMetrics, pointInArea } from '../../src/utils/dashboardMetrics.js';
const now = new Date('2026-10-24T10:00:00Z');
const period = { start: new Date('2026-10-24T00:00:00+05:30'), end: now };
const order = (status, extra = {}) => ({ _id: status, status, createdAt: now, totalAmount: 100.49, ...extra });

test('operational totals exclude closed orders and B2B drafts while retaining paise and legacy statuses', () => {
    const data = dashboardMetrics(['PROCESSING', 'DELIVERED', 'CANCELLED'].map(status => order(status)), ['CART', 'PENDING_PAYMENT', 'Submitted', 'Confirmed', 'Delivered', 'Settled', 'Cancelled', 'REJECTED'].map(status => order(status)), period, now);
    assert.deepEqual(data.activeOrders, { total: 3, b2c: 1, b2b: 2 });
    assert.equal(data.gmv.today, 602.94); assert.equal(data.gmv.selectedPeriod, 602.94);
});
test('current alerts and active counts survive a booking date filter; cleared alerts disappear', () => {
    const data = dashboardMetrics([
        order('ORDER_PLACED', { createdAt: new Date('2026-09-01'), orderId: 'OLD' }),
        order('DELIVERED', { paymentStatus: 'Pending', dueAmount: 95, statusHistory: [{ status: 'DELIVERED', timestamp: new Date('2026-10-23') }] }),
        order('DELIVERED', { paymentStatus: 'Paid', dueAmount: 0, statusHistory: [{ status: 'DELIVERED', timestamp: new Date('2026-10-23') }] }),
        order('DELIVERED', { paymentStatus: 'Pending', dueAmount: 95 }),
        order('ORDER_PLACED', { createdAt: new Date('2026-09-01'), orderType: 'Walk-In' })
    ], [], period, now);
    assert.equal(data.activeOrders.total, 2); assert.equal(data.delayedPickups.length, 1); assert.equal(data.delayedPickups[0].orderNumber, 'OLD'); assert.equal(data.unpaidDeliveries.length, 1);
    assert.equal(data.gmv.today, 301.47); assert.equal(data.coverage.unpaidDeliveriesWithoutTimestamp, 1);
});
test('riders are distinct stored identities and missing identities remain explicit', () => {
    const data = dashboardMetrics([
        order('IN_TRANSIT', { riderDetails: { phone: '+91 98765 43210' } }),
        order('OUT_FOR_DELIVERY', { riderDetails: { phone: '9876543210' } }),
        order('RIDER_ARRIVING'), order('PROCESSING', { rider: 'idle-rider' }), order('DELIVERED', { rider: 'finished-rider' })
    ], [], period, now);
    assert.equal(data.ridersOnTrips.count, 1); assert.equal(data.ridersOnTrips.recordedTrips, 3); assert.equal(data.ridersOnTrips.unidentifiedTrips, 1);
});
test('daily GMV uses India midnight and is independent of the selected period', () => {
    const data = dashboardMetrics([order('DELIVERED', { createdAt: new Date('2026-10-23T18:30:00Z') }), order('DELIVERED', { createdAt: new Date('2026-10-23T18:29:59Z') })], [], { start: new Date('2026-10-01'), end: now }, now);
    assert.equal(data.gmv.today, 100.49); assert.equal(data.gmv.selectedPeriod, 200.98);
});
test('geofence matching respects coordinates and polygon holes', () => {
    const area = { boundary: { coordinates: [[[0,0],[4,0],[4,4],[0,4],[0,0]], [[1,1],[2,1],[2,2],[1,2],[1,1]]] } };
    assert.equal(pointInArea({ lat: 3, lng: 3 }, area), true); assert.equal(pointInArea({ lat: 1.5, lng: 1.5 }, area), false); assert.equal(pointInArea(null, area), false);
});

test('chart buckets reconcile to scoped totals and preserve India-day boundaries', () => {
    const data = dashboardMetrics([
        order('PROCESSING', { createdAt: new Date('2026-10-23T18:29:59Z') }),
        order('READY_FOR_DISPATCH', { createdAt: new Date('2026-10-23T18:30:00Z') }),
        order('IN_TRANSIT', { createdAt: new Date('2026-10-24T00:00:00Z') }),
        order('CANCELLED', { createdAt: now, totalAmount: 99999 })
    ], [order('Confirmed', { totalAmount: 20.25 }), order('CART', { totalAmount: 99999 })], { start: new Date('2026-10-22T18:30:00Z'), end: now }, now);
    assert.equal(data.charts.gmvTrend.granularity, 'day');
    assert.equal(data.charts.gmvTrend.points[0].amount, 100.49);
    assert.equal(data.charts.gmvTrend.points[1].amount, 221.23);
    assert.equal(Math.round(data.charts.gmvTrend.points.reduce((sum, point) => sum + point.amount, 0) * 100), Math.round(data.gmv.selectedPeriod * 100));
    assert.equal(data.charts.activeStages.reduce((sum, stage) => sum + stage.b2c + stage.b2b, 0), data.activeOrders.total);
});
test('empty trends have real zero buckets; broad custom windows remain bounded', () => {
    const daily = dashboardMetrics([], [], period, now).charts.gmvTrend;
    assert.equal(daily.granularity, 'hour'); assert.ok(daily.points.length > 0); assert.ok(daily.points.every(point => point.amount === 0 && point.orders === 0));
    const broad = dashboardMetrics([order('DELIVERED')], [], { start: new Date('2000-01-01'), end: new Date('2100-01-01') }, now).charts.gmvTrend;
    assert.equal(broad.granularity, 'year'); assert.equal(broad.points.reduce((sum, point) => sum + point.amount, 0), 100.49); assert.ok(broad.points.length <= 101);
});
