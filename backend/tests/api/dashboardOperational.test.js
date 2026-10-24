import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Order from '../../src/models/Order.js';
import B2BOrder from '../../src/models/B2BOrder.js';
import ServiceArea from '../../src/models/ServiceArea.js';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';
let env, admin, customer, vendor, supplier, oldPickup, unpaid;
const path = '/api/admin/dashboard-analytics?view=operational';
const request = (query = '', actor = admin) => api(env.baseUrl, path + query, { token: actor && tokenFor(actor.role, String(actor._id)) });
before(async () => {
    env = await startTestEnvironment({ env: { SHIPROCKET_ENABLED: 'false', WHATSAPP_ENABLED: 'false' } });
    await mongoose.connect(env.mongoUri);
    [admin, customer, vendor, supplier] = await User.create([
        { role: 'Admin', geofenceRestrictions: ['MIXED ZONE'] },
        { role: 'Customer', addresses: [{ address: 'Dashboard fixture', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', location: { lat: 1, lng: 1 }, isDefault: true }] },
        { role: 'Vendor' }, { role: 'Supplier' }
    ].map((entry, i) => ({ phone: `993300000${i}`, displayName: `Dashboard ${i}`, location: { lat: 1, lng: 1 }, ...entry })));
    await User.create({ role: 'Supplier', phone: '9933000088', location: { lat: 5, lng: 5 }, supplierDetails: { entityType: 'Private outside supplier type' } });
    await ServiceArea.create([
        { areaName: 'MIXED ZONE', city: 'Bengaluru', pincodes: ['560001'], boundary: { coordinates: [[[0.5,0.5],[2,0.5],[2,2],[0.5,2],[0.5,0.5]]] } },
        { areaName: 'SECRET ZONE', city: 'Private city', pincodes: ['999999'], boundary: { coordinates: [[[4,4],[6,4],[6,6],[4,6],[4,4]]] } }
    ]);
    const base = { customer: customer._id, vendor: vendor._id, pickupAddress: 'Pickup', dropAddress: 'Drop', pickupLocation: { lat: 1, lng: 1 }, items: [], totalAmount: 100.49 };
    [oldPickup, unpaid] = await Order.create([
        { ...base, status: 'ORDER_PLACED' },
        { ...base, status: 'DELIVERED', paymentStatus: 'Pending', dueAmount: 50 },
        { ...base, status: 'PROCESSING' }, { ...base, status: 'CANCELLED' },
        { ...base, status: 'OUT_FOR_DELIVERY', riderDetails: { phone: '9876543210' } },
        { ...base, status: 'RIDER_ARRIVING', riderDetails: { phone: '+91 9876543210' } },
        { ...base, status: 'IN_TRANSIT' },
        { ...base, status: 'ORDER_PLACED', pickupLocation: { lat: 5, lng: 5 }, totalAmount: 99999 }
    ]);
    await Order.collection.updateOne({ _id: oldPickup._id }, { $set: { createdAt: new Date(Date.now() - 40 * 86400000) } });
    await Order.collection.updateOne({ _id: unpaid._id }, { $set: { statusHistory: [{ status: 'DELIVERED', timestamp: new Date(Date.now() - 4 * 3600000) }] } });
    await B2BOrder.create(['CART', 'PENDING_PAYMENT', 'Submitted', 'Confirmed', 'Delivered', 'Settled', 'Cancelled', 'REJECTED'].map((status, i) => ({ vendor: vendor._id, supplier: supplier._id, cycleId: `dashboard-${i}`, deliveryDay: 'Sunday', deliveryDate: new Date(), status, pincode: '560001', city: 'Bengaluru', totalAmount: 10.25, items: [] })));
}, { timeout: 90000 });
after(async () => { await mongoose.disconnect(); await env?.stop(); });

test('canonical dashboard shares scope and counts current backlog with exact currency', async () => {
    const response = await request(); assert.equal(response.status, 200);
    const data = response.body.data;
    assert.deepEqual(data.activeOrders, { total: 7, b2c: 5, b2b: 2 }); assert.equal(data.gmv.today, 543.45);
    assert.equal(Math.round(data.charts.gmvTrend.points.reduce((sum, point) => sum + point.amount, 0) * 100), Math.round(data.gmv.selectedPeriod * 100));
    assert.equal(data.charts.activeStages.reduce((sum, stage) => sum + stage.b2c + stage.b2b, 0), data.activeOrders.total);
    assert.equal(data.transactions.total, data.gmv.selectedPeriod);
    assert.equal(data.transactions.customerValue + data.transactions.supplyValue, data.transactions.total);
    assert.deepEqual([data.partnersAndClients.clients, data.partnersAndClients.vendors, data.partnersAndClients.suppliers], [1, 1, 1]);
    assert.ok(data.orderTimeline.total > 0);
    const outside = await Order.findOne({ totalAmount: 99999 }).select('_id').lean();
    assert.ok(!data.orderTimeline.items.some(event => event.orderId === String(outside._id)));
    assert.ok(!JSON.stringify(data.partnersAndClients).includes('Private outside supplier type'));
    assert.equal(data.financialOverview.customerOutstanding, 50);
    assert.equal(data.supplierOverview.totalSuppliers, 1); assert.equal(data.supplierOverview.activeOrders, 2);
    assert.equal(data.supplierOverview.bookedValue, data.transactions.supplyValue);
    assert.equal(data.supplierOverview.bookedOrders, 4); assert.equal(data.supplierOverview.completedOrders, 2);
    assert.ok(!JSON.stringify(data.supplierOverview).includes('Private outside supplier type'));
    assert.equal(data.ridersOnTrips.count, 1); assert.equal(data.ridersOnTrips.unidentifiedTrips, 1);
    assert.equal(data.delayedPickups.total, 1); assert.equal(data.delayedPickups.items[0].orderId, String(oldPickup._id)); assert.equal(data.unpaidDeliveries.total, 1);
    assert.ok(!JSON.stringify(data).includes('riderDetails')); assert.ok(!JSON.stringify(data).includes('9876543210'));
    assert.ok(!('financials' in data)); assert.ok(!('vendorPerformance' in data));
    const future = await request('&timeRange=Custom%20Range&startDate=2099-01-01&endDate=2099-01-02');
    assert.equal(future.body.data.gmv.selectedPeriod, 0); assert.equal(future.body.data.gmv.today, data.gmv.today);
    assert.equal(future.body.data.delayedPickups.total, 1); assert.equal(future.body.data.activeOrders.total, 7);
});
test('canonical geography values intersect scope and channel', async () => {
    const filters = await api(env.baseUrl, '/api/admin/dashboard-analytics/filters', { token: tokenFor('Admin', String(admin._id)) });
    assert.equal(filters.status, 200); assert.deepEqual(filters.body.data.geofenceMap.Bengaluru, ['MIXED ZONE']);
    assert.ok(!filters.body.data.states.includes('Madhya Pradesh')); assert.ok(!JSON.stringify(filters.body).includes('SECRET'));
    const selected = await request('&geofence=MIXED%20ZONE&channel=B2C'); assert.equal(selected.body.data.activeOrders.total, 5); assert.equal(selected.body.data.gmv.today, 502.45); assert.equal(selected.body.data.supplierOverview.available, false);
    const mismatch = await request('&geofence=MIXED%20ZONE&pincode=999999'); assert.equal(mismatch.body.data.activeOrders.total, 0);
    const forbidden = await request('&geofence=SECRET%20ZONE');
    assert.equal(forbidden.body.data.activeOrders.total, 0); assert.equal(forbidden.body.data.partnersAndClients.total, 0); assert.equal(forbidden.body.data.orderTimeline.total, 0); assert.equal(forbidden.body.data.supplierOverview.totalSuppliers, 0); assert.equal(forbidden.body.data.supplierOverview.bookedValue, 0);
    const supply = await request('&channel=B2B'); assert.equal(supply.body.data.gmv.today, 41); assert.equal(supply.body.data.activeOrders.total, 2); assert.equal(supply.body.data.partnersAndClients.clients, 0); assert.equal(supply.body.data.transactions.customerValue, 0);
    const unrestricted = await User.create({ role: 'Admin', phone: '9933000099' });
    await Order.create({ orderType: 'Walk-In', vendor: null, customer: null, pickupAddress: 'Archived walk-in', dropAddress: 'Archived walk-in', status: 'PROCESSING', totalAmount: 0, items: [] });
    const archived = await request('&geofence=MIXED%20ZONE&channel=B2C', unrestricted);
    assert.equal(archived.status, 200, 'archived vendor must not turn geofence selection into a cast error');
    assert.equal(archived.body.data.activeOrders.total, 5);

});
test('refresh follows payment and order transitions while preserving payment amounts', async () => {
    const before = await Order.findById(unpaid._id).lean();
    await Order.updateOne({ _id: unpaid._id }, { paymentStatus: 'Paid', dueAmount: 0 }); await Order.updateOne({ _id: oldPickup._id }, { status: 'PROCESSING' });
    const data = (await request()).body.data; assert.equal(data.unpaidDeliveries.total, 0); assert.equal(data.delayedPickups.total, 0); assert.equal(data.financialOverview.paidOrderValue, 100.49);
    const after = await Order.findById(unpaid._id).lean(); assert.equal(after.totalAmount, before.totalAmount); assert.equal(after.advanceAmount, before.advanceAmount);
});
test('alert pagination, validation, authentication and refreshed permissions', async () => {
    await Order.create(Array.from({ length: 23 }, () => ({ customer: customer._id, pickupLocation: { lat: 1, lng: 1 }, pickupAddress: 'Pickup', dropAddress: 'Drop', status: 'ORDER_PLACED', pickupExpectedDate: new Date(Date.now() - 5 * 3600000), totalAmount: 0, items: [] })));
    const first = (await request()).body.data.delayedPickups, second = (await request('&page=2')).body.data.delayedPickups;
    assert.equal(first.total, 23); assert.equal(first.items.length, 20); assert.equal(second.items.length, 3); assert.equal(new Set([...first.items, ...second.items].map(item => item.orderId)).size, 23);
    assert.equal((await request('&page=0')).status, 400); assert.equal((await request('&channel=invalid')).status, 400); assert.equal((await request('&timeRange=Custom%20Range&startDate=bad')).status, 400);
    assert.equal((await request('', null)).status, 401); assert.equal((await request('', customer)).status, 403);
    await User.updateOne({ _id: admin._id }, { geofenceRestrictions: ['NO AREA'] }); assert.equal((await request()).body.data.activeOrders.total, 0);
});
