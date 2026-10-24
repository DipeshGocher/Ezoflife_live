import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsWindow } from '../../src/utils/analyticsWindow.js';
import { processingSample, slaExceptions, summarizeTat, densityCells } from '../../src/utils/operationalMetrics.js';
const at = hours => new Date(Date.UTC(2026, 0, 1) + hours * 3600000);
const order = (hours = 25) => ({ _id: 'one', status: 'PROCESSING', createdAt: at(0), updatedAt: at(1000), deliveryMode: 'Normal', statusHistory: [{ status: 'PROCESSING', timestamp: at(1) }, { status: 'READY_FOR_DISPATCH', timestamp: at(1 + hours) }] });
test('business-day windows use India midnight and reject invalid custom dates', () => {
    const period = analyticsWindow({}, new Date('2026-10-24T01:00:00Z'));
    assert.equal(period.start.toISOString(), '2026-10-23T18:30:00.000Z');
    assert.throws(() => analyticsWindow({ timeRange: 'Custom Range', startDate: '2026-02-30', endDate: '2026-03-01' }));
    assert.throws(() => analyticsWindow({ timeRange: 'Custom Range', startDate: '2026-01-02', endDate: '2026-01-01' }));
});
test('TAT excludes missing and cancelled records and computes exact statistics', () => {
    const summary = summarizeTat([order(1), order(3), order(26), { status: 'CANCELLED' }, { status: 'DELIVERED', updatedAt: at(3) }]);
    assert.equal(summary.sampleCount, 3); assert.equal(summary.averageHours, 10); assert.equal(summary.medianHours, 3); assert.equal(summary.p90Hours, 26); assert.equal(summary.normalBreachCount, 1); assert.equal(summary.missingTimestamps, 1); assert.equal(summary.cancelled, 1);
    assert.deepEqual(processingSample({ status: 'PROCESSING' }), { excluded: 'missing_timestamps' });
});
test('SLA thresholds use original events and respect cancellation, walk-in and Express', () => {
    assert.equal(slaExceptions(order(), +at(24.99)).length, 0);
    assert.equal(slaExceptions(order(), +at(25)).length, 1);
    assert.equal(slaExceptions({ ...order(), deliveryMode: 'Express' }, +at(100)).length, 0);
    assert.equal(slaExceptions({ ...order(), status: 'CANCELLED' }, +at(100)).length, 0);
    assert.equal(slaExceptions({ _id: 'two', status: 'ORDER_PLACED', createdAt: at(0), orderType: 'Walk-In' }, +at(3)).length, 0);
    const delivered = { ...order(), status: 'DELIVERED', paymentStatus: 'Pending', dueAmount: 50, statusHistory: [{ status: 'DELIVERED', timestamp: at(10) }] };
    assert.equal(slaExceptions(delivered, +at(12)).length, 1);
    assert.equal(slaExceptions({ ...delivered, paymentStatus: 'Paid' }, +at(12)).length, 0);
});
test('density counts valid zero coordinates and separates missing locations', () => {
    const result = densityCells([{ pickupLocation: { lat: 0, lng: 0 } }, { pickupLocation: { lat: 0, lng: 0 } }, {}]);
    assert.equal(result.located, 2); assert.equal(result.unlocated, 1); assert.equal(result.cells.reduce((sum, cell) => sum + cell.count, 0), 2);
});


test('future scheduled pickup cannot breach merely because the order was booked early', () => {
    const scheduled = { _id: 'future', status: 'RIDER_ARRIVING', createdAt: at(0), pickupExpectedDate: at(48) };
    assert.equal(slaExceptions(scheduled, +at(24)).length, 0);
    assert.equal(slaExceptions(scheduled, +at(49.99)).length, 0);
    assert.equal(slaExceptions(scheduled, +at(50)).length, 1);
});
