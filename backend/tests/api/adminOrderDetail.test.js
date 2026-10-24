import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Order from '../../src/models/Order.js';
import ServiceArea from '../../src/models/ServiceArea.js';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';

let env, admin, restricted, readonly, customer, vendor, first, second, archived, walkin;
const read = (id, token = tokenFor('Admin', String(admin._id))) => api(env.baseUrl, `/api/admin/orders/${encodeURIComponent(id)}`, { token });

before(async () => {
    env = await startTestEnvironment({ env: { SHIPROCKET_ENABLED: 'false', WHATSAPP_ENABLED: 'false' } });
    await mongoose.connect(env.mongoUri);
    [admin, restricted, readonly, customer, vendor] = await User.create([
        { phone: '9991000001', displayName: 'Admin', role: 'Admin', status: 'approved' },
        { phone: '9991000002', displayName: 'Scoped Admin', role: 'Admin', status: 'approved', geofenceRestrictions: ['Allowed'] },
        { phone: '9991000003', displayName: 'Read Admin', role: 'Admin', status: 'approved', adminAccessType: 'Read-Only' },
        { phone: '9991000004', displayName: 'Actual Customer', role: 'Customer', status: 'approved' },
        { phone: '9991000005', displayName: 'Actual Owner', role: 'Vendor', status: 'approved', location: { lat: 1, lng: 1 }, shopDetails: { name: 'Actual Shop', address: 'Shop 12' } }
    ]);
    await ServiceArea.create({ areaName: 'Allowed', isActive: true, boundary: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] } });
    const base = { customer: customer._id, vendor: vendor._id, pickupAddress: 'Pickup', dropAddress: 'Actual delivery address', pickupLocation: { lat: 1, lng: 1 }, status: 'PROCESSING', totalAmount: 318.6,
        items: [{ serviceId: 'service-1', name: 'Actual service', quantity: 2, price: 100 }],
        priceBreakdown: { baseWithArea: 200, platformFee: 20, logisticsFee: 50, gstAmount: 48.6 },
        pickupOtp: '1234', deliveryOtp: '5678', logisticsHandshakes: [{ phase: 'Collection', otp: '7777', isVerified: true }]
    };
    [first, second, archived, walkin] = await Order.create([
        base,
        { ...base, totalAmount: 500, pickupLocation: { lat: 5, lng: 5 } },
        { ...base, customer: null, vendor: null, customerSnapshot: { displayName: 'Archived Customer', phone: '1234567890', isExUser: true }, vendorSnapshot: { displayName: 'Archived Owner', shopName: 'Archived Shop', isExUser: true } },
        { ...base, orderType: 'Walk-In', pickupLocation: { lat: 5, lng: 5 } }
    ]);
}, { timeout: 90000 });
after(async () => { await mongoose.disconnect(); if (env) await env.stop(); });

test('admin receives the actual order, populated parties and recorded prices without changing storage', async () => {
    const before = JSON.stringify(await Order.findById(first._id).lean());
    const res = await read(String(first._id));
    assert.equal(res.status, 200);
    assert.equal(res.body.customer.displayName, 'Actual Customer');
    assert.equal(res.body.vendor.displayName, 'Actual Owner');
    assert.equal(res.body.vendor.shopDetails.name, 'Actual Shop');
    assert.equal(res.body.items[0].quantity, 2);
    assert.equal(res.body.items[0].price, 100);
    assert.equal(res.body.totalAmount, 318.6);
    assert.equal(res.body.status, 'PROCESSING');
    assert.equal(res.body.statusHistory.length, first.statusHistory.length);
    assert.equal(res.body.pickupOtp, undefined);
    assert.equal(res.body.deliveryOtp, undefined);
    assert.equal(res.body.logisticsHandshakes[0].otp, undefined);
    assert.equal(JSON.stringify(await Order.findById(first._id).lean()), before);
});

test('human-readable IDs with and without a leading hash resolve to the same order', async () => {
    for (const id of [first.orderId, first.orderId.slice(1)]) {
        const res = await read(id);
        assert.equal(res.status, 200);
        assert.equal(res.body._id, String(first._id));
    }
    const other = await read(String(second._id));
    assert.equal(other.body.totalAmount, 500);
    assert.notEqual(other.body._id, String(first._id));
});

test('anonymous, customer, inactive and nonexistent admin sessions cannot access admin details', async () => {
    assert.equal((await api(env.baseUrl, `/api/admin/orders/${first._id}`)).status, 401);
    assert.equal((await read(String(first._id), tokenFor('Customer', String(customer._id)))).status, 403);
    const inactive = await User.create({ phone: '9991000006', role: 'Admin', status: 'rejected' });
    assert.equal((await read(String(first._id), tokenFor('Admin', String(inactive._id)))).status, 403);
    assert.equal((await read(String(first._id), tokenFor('Admin', String(new mongoose.Types.ObjectId())))).status, 403);
});

test('scoped admins can only read orders in their assigned zones, including vendor-located walk-ins', async () => {
    const token = tokenFor('Admin', String(restricted._id));
    assert.equal((await read(String(first._id), token)).status, 200);
    const denied = await read(String(second._id), token);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.items, undefined);
    assert.equal((await read(String(walkin._id), token)).status, 200);
});

test('read-only admins can inspect orders and missing orders return 404', async () => {
    assert.equal((await read(String(first._id), tokenFor('Admin', String(readonly._id)))).status, 200);
    assert.equal((await read(String(new mongoose.Types.ObjectId()))).status, 404);
    assert.equal((await read('not-an-order')).status, 404);
});

test('deleted-party records retain their stored snapshots', async () => {
    const res = await read(String(archived._id));
    assert.equal(res.status, 200);
    assert.equal(res.body.customer, null);
    assert.equal(res.body.customerSnapshot.displayName, 'Archived Customer');
    assert.equal(res.body.vendorSnapshot.shopName, 'Archived Shop');
});

test('existing customer detail and admin list endpoints retain their contracts', async () => {
    const res = await api(env.baseUrl, `/api/orders/${first._id}`, { token: tokenFor('Customer', String(customer._id)) });
    assert.equal(res.status, 200);
    assert.equal(res.body._id, String(first._id));
    const list = await api(env.baseUrl, '/api/orders/all?page=1&limit=10', { token: tokenFor('Admin', String(admin._id)) });
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 4);
    assert.equal(list.body.pagination.total, 4);
});
