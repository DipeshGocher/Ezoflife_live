import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardOverview, partnerBreakdown, supplierOverview } from '../../src/utils/dashboardOverview.js';
const period = { start: new Date('2026-10-01T00:00:00+05:30'), end: new Date('2026-10-24T10:00:00Z') };
const order = (id, extra = {}) => ({ _id: id, orderId: id, status: 'PROCESSING', createdAt: new Date('2026-10-10'), totalAmount: 100.49, ...extra });
test('combined transactions and financial figures distinguish booked, paid, pending, fees and refund-marked facts', () => {
    const data = dashboardOverview([
        order('paid', { paymentStatus: 'Paid', priceBreakdown: { platformFee: 10.05 } }),
        order('pending', { paymentStatus: 'Pending', dueAmount: 25.25, priceBreakdown: { platformFee: 5 } }),
        order('cancel', { status: 'CANCELLED', totalAmount: 1000, paymentStatus: 'Refunded' }),
        order('outside', { createdAt: new Date('2026-09-01'), totalAmount: 9999 })
    ], [order('supply-paid', { status: 'Delivered', paymentStatus: 'Paid', platformFee: 2, totalAmount: 20.25 }), order('supply-pending', { status: 'Submitted', paymentStatus: 'Pending', totalAmount: 30.75 }), order('draft', { status: 'CART', totalAmount: 99999 })], period, period.end);
    assert.deepEqual(data.transactions, { total: 251.98, customerValue: 200.98, supplyValue: 51, customerOrders: 2, supplyOrders: 2 });
    assert.deepEqual(data.financialOverview, { paidOrderValue: 120.74, customerOutstanding: 25.25, supplyPendingValue: 30.75, platformFees: 17.05, refundMarkedValue: 1000, refundMarkedOrders: 1 });
});
test('partner classification uses saved types, with explicit unspecified groups', () => {
    const data = partnerBreakdown([{ role: 'Customer', customerType: 'retail' }, { role: 'Customer', customerType: 'individual' }, { role: 'Vendor', businessType: 'Partnership' }, { role: 'Vendor' }, { role: 'Supplier', supplierDetails: { businessName: 'Wholesaler in name only', entityType: 'Manufacturer' } }]);
    assert.equal(data.total, 5); assert.equal(data.clients, 2); assert.equal(data.vendors, 2); assert.equal(data.suppliers, 1);
    assert.deepEqual(data.supplierTypes, [{ name: 'Manufacturer', count: 1 }]); assert.ok(data.vendorTypes.some(row => row.name === 'Unspecified' && row.count === 1));
});
test('timeline shows recorded events in the selected period without manufacturing B2B milestones', () => {
    const data = dashboardOverview([
        order('historic', { createdAt: new Date('2026-09-01'), statusHistory: [{ status: 'DELIVERED', timestamp: new Date('2026-10-22') }] }),
        order('placed', { createdAt: new Date('2026-10-10'), statusHistory: [{ status: 'ORDER_PLACED', timestamp: new Date('2026-10-10T00:00:01Z') }] }),
        order('future', { createdAt: new Date('2026-10-25') })
    ], [order('supply', { status: 'DELIVERED' })], period, period.end);
    assert.equal(data.orderTimeline.total, 3); assert.equal(data.orderTimeline.items[0].status, 'DELIVERED');
    assert.equal(data.orderTimeline.items.filter(event => event.orderId === 'placed').length, 1);
    assert.equal(data.orderTimeline.items.find(event => event.channel === 'supply').status, 'ORDER_CREATED');
});


test('supplier analytics reconcile to supply totals while keeping current workload separate from booking dates', () => {
    const users = [{ _id: 'one', role: 'Supplier', status: 'approved', supplierDetails: { businessName: 'Visible Supplier', entityType: 'Supplier' } }, { _id: 'two', role: 'Supplier', status: 'approved', isBlocked: true, supplierDetails: { entityType: 'Distributor/Wholesaler' } }];
    const supplies = [order('paid', { supplier: 'one', status: 'Delivered', totalAmount: 120.25 }), order('old', { supplier: 'one', status: 'PROCESSING', createdAt: new Date('2026-09-01'), totalAmount: 999 }), order('other', { supplier: 'hidden', status: 'ACCEPTED', totalAmount: 50.75 }), order('draft', { supplier: 'one', status: 'CART', totalAmount: 99999 }), order('cancelled', { supplier: 'one', status: 'Cancelled', totalAmount: 1000 })];
    const data = supplierOverview(users, supplies, period);
    assert.equal(data.totalSuppliers, 2); assert.equal(data.activeSuppliers, 1); assert.equal(data.activeOrders, 2); assert.equal(data.bookedOrders, 2); assert.equal(data.completedOrders, 1); assert.equal(data.cancelledOrders, 1); assert.equal(data.bookedValue, 171);
    assert.equal(data.rows.find(row => row.id === 'one').activeOrders, 1); assert.equal(data.other.bookedValue, 50.75);
    assert.equal(data.rows.reduce((sum, row) => sum + row.bookedValue, 0) + data.other.bookedValue, data.bookedValue);
    assert.equal(data.bookedValue, dashboardOverview([], supplies, period, period.end).transactions.supplyValue);
    assert.ok(!JSON.stringify(data).includes('hidden'));
});
