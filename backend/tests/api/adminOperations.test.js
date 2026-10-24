import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Order from '../../src/models/Order.js';
import Ticket from '../../src/models/Ticket.js';
import Notification from '../../src/models/Notification.js';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';
let env, admin, staff, readonly, customer, outsider, order, ticket;
const call = (path, actor = admin, method = 'GET', body) => api(env.baseUrl, path, { token: actor && tokenFor(actor.role, String(actor._id)), method, body });
before(async () => {
    env = await startTestEnvironment({ env: { SHIPROCKET_ENABLED: 'false', WHATSAPP_ENABLED: 'false' } }); await mongoose.connect(env.mongoUri);
    [admin, staff, readonly, customer, outsider] = await User.create(['Admin', 'Admin', 'Admin', 'Customer', 'Customer'].map((role, index) => ({ role, phone: `991122330${index}`, displayName: `Actor ${index}`, status: 'approved', adminAccessType: index === 2 ? 'Read-Only' : 'Read/Write' })));
    order = await Order.create({ customer: customer._id, vendor: null, pickupAddress: 'Pickup', dropAddress: 'Drop', totalAmount: 100, dueAmount: 100, status: 'PROCESSING', pickupLocation: { lat: 1, lng: 1 }, statusHistory: [{ status: 'PROCESSING', timestamp: new Date(Date.now() - 30 * 3600000) }] });
    // The real save hook adds the initial current status; pin the business event once.
    await Order.updateOne({ _id: order._id }, { $set: { statusHistory: [{ status: 'PROCESSING', timestamp: new Date(Date.now() - 30 * 3600000) }] } });
    ticket = await Ticket.create({ customer: customer._id, order: order._id, subject: 'Help', description: 'Problem' });
}, { timeout: 90000 });
after(async () => { await mongoose.disconnect(); if (env) await env.stop(); });
test('concurrent assignment has one winner and records an owner history', async () => {
    const body = { assignedTo: String(staff._id), expectedVersion: 0, reason: 'Handle this case' };
    const results = await Promise.all([call(`/api/tickets/admin/${ticket._id}/assignment`, admin, 'PATCH', body), call(`/api/tickets/admin/${ticket._id}/assignment`, admin, 'PATCH', body)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const stored = await Ticket.findById(ticket._id); assert.equal(stored.assignmentVersion, 1); assert.equal(stored.assignmentHistory.length, 1);
    const detail = await call(`/api/tickets/${ticket._id}`); assert.equal(detail.body.assignedTo.displayName, staff.displayName);
    assert.equal((await call(`/api/tickets/admin/${ticket._id}/assignment`, readonly, 'PATCH', { ...body, expectedVersion: 1 })).status, 403);
    assert.equal((await call(`/api/tickets/admin/${ticket._id}/assignment`, customer, 'PATCH', { ...body, expectedVersion: 1 })).status, 403);
    const invalid = await call(`/api/tickets/admin/${ticket._id}/assignment`, admin, 'PATCH', { ...body, assignedTo: String(readonly._id), expectedVersion: 1 }); assert.equal(invalid.status, 400);
});
test('notification ownership is enforced', async () => {
    const notification = await Notification.create({ recipient: customer._id, role: 'user', title: 'Private', message: 'Private' });
    assert.equal((await call(`/api/notifications?userId=${customer._id}`, outsider)).status, 403);
    assert.equal((await call(`/api/notifications/${notification._id}/read`, outsider, 'PATCH', {})).status, 404);
    assert.equal((await call(`/api/notifications?userId=${customer._id}`, customer)).status, 200);
});

test('invoice issuance is idempotent and preserves order/settings snapshots', async () => {
    await Order.updateOne({ _id: order._id }, { $set: { items: [{ name: 'Wash', quantity: 1, price: 100 }] } });
    const results = await Promise.all([call(`/api/admin/orders/${order._id}/invoices`, admin, 'POST', { type: 'customer' }), call(`/api/admin/orders/${order._id}/invoices`, admin, 'POST', { type: 'customer' })]);
    assert.ok(results.every(result => [200, 201].includes(result.status))); assert.equal(results[0].body.number, results[1].body.number);
    const number = results[0].body.number;
    await Order.updateOne({ _id: order._id }, { $set: { totalAmount: 900 } });
    const again = await call(`/api/admin/orders/${order._id}/invoices`); assert.equal(again.body.facts.totalAmount, 100); assert.equal(again.body.number, number);
    const IssuedInvoice = (await import('../../src/models/IssuedInvoice.js')).default;
    await assert.rejects(() => IssuedInvoice.updateOne({ order: order._id }, { $set: { number: 'tamper' } }), /immutable/);
    assert.equal((await call(`/api/admin/orders/${order._id}/invoices`, readonly, 'POST', { type: 'customer' })).status, 403);
});

test('named admin module grants apply to HTTP and use current stored permissions', async () => {
    await User.updateOne({ _id: staff._id }, { $set: { adminRole: 'Customer Support Executive', adminPermissions: ['Support Tickets'] } });
    assert.equal((await call('/api/tickets/admin/all', staff)).status, 200);
    assert.equal((await call('/api/admin/stats', staff)).status, 403);
    await User.updateOne({ _id: staff._id }, { $addToSet: { adminPermissions: 'Dashboard' } });
    assert.equal((await call('/api/admin/stats', staff)).status, 200);
});

test('maintenance cannot mutate through GET or anonymous POST', async () => {
    assert.equal((await call('/api/maintenance/seed-materials', null, 'POST', {})).status, 401);
    assert.equal((await call('/api/maintenance/seed-materials', admin)).status, 405);
    assert.equal((await call('/api/maintenance/seed-materials', readonly, 'POST', {})).status, 403);
});

test('B2B account and individual reads reject unrelated identities before disclosure', async () => {
    const B2BOrder = (await import('../../src/models/B2BOrder.js')).default;
    const vendor = await User.create({ role: 'Vendor', phone: '9922334499', status: 'approved' });
    const b2b = await B2BOrder.create({ vendor: vendor._id, cycleId: 'scope', deliveryDay: 'Sunday', deliveryDate: new Date(), pincode: '111111', totalAmount: 100, items: [] });
    assert.equal((await call(`/api/b2b-orders/${b2b._id}`, outsider)).status, 403);
    assert.equal((await call(`/api/b2b-orders/vendor/${vendor._id}`, outsider)).status, 403);
    assert.equal((await call(`/api/b2b-orders/${b2b._id}`, vendor)).status, 200);
    assert.equal((await call(`/api/b2b-orders/${b2b._id}`, null)).status, 401);
});

test('final approval persists one activation notice across retries', async () => {
    const applicant = await User.create({ role: 'Customer', phone: '9922334488', status: 'pending', onboardingStage: 'FINAL_REVIEW' });
    assert.equal((await call(`/api/admin/vendor-request/${applicant._id}/approve-final`, admin, 'PATCH', {})).status, 200);
    assert.equal((await call(`/api/admin/vendor-request/${applicant._id}/approve-final`, admin, 'PATCH', {})).status, 200);
    assert.equal(await Notification.countDocuments({ eventKey: `vendor_activated:${applicant._id}` }), 1);
    assert.equal((await User.findById(applicant._id)).role, 'Vendor');
});

test('dispute evidence is order-linked, rejects cross-account access and omits OTPs', async () => {
    await Order.updateOne({ _id: order._id }, { $set: { customerPhotos: ['https://example.com/booking.jpg', 'javascript:alert(1)'], logisticsHandshakes: [{ phase: 'Collection', otp: '123456', isVerified: true, verifiedAt: new Date() }] } });
    const result = await call(`/api/tickets/admin/${ticket._id}/evidence`); assert.equal(result.status, 200); assert.equal(result.body.bookingPhotos.length, 1); assert.equal(result.body.custody[0].phase, 'Collection'); assert.ok(!JSON.stringify(result.body).includes('123456'));
    assert.equal((await call(`/api/tickets/admin/${ticket._id}/evidence`, outsider)).status, 403);
    const publicTicket = await call(`/api/tickets/${ticket._id}`, customer); assert.equal(publicTicket.status, 200); assert.equal(publicTicket.body.assignmentHistory, undefined);
});

test('invoice and support actions fail closed for an admin with no matching areas', async () => {
    const restricted = await User.create({ role: 'Admin', phone: '9922334477', status: 'approved', geofenceRestrictions: ['Unassigned zone'] });
    assert.equal((await call(`/api/admin/orders/${order._id}/invoices`, restricted, 'POST', { type: 'customer' })).status, 403);
    assert.equal((await call(`/api/tickets/admin/${ticket._id}/assignment`, restricted, 'PATCH', { assignedTo: null, expectedVersion: 1, reason: 'Unauthorized' })).status, 403);
});

test('external payout recording rejects negative values and makes repeated references idempotent', async () => {
    const vendor = await User.create({ role: 'Vendor', phone: '9922334466', status: 'approved' });
    const body = { vendorId: String(vendor._id), amount: 50, transactionId: 'ADMIN-TEST-EXTERNAL-001', paymentMethod: 'UPI' };
    assert.equal((await call('/api/admin/record-vendor-payout', admin, 'POST', { ...body, amount: -1 })).status, 400);
    const results = await Promise.all([call('/api/admin/record-vendor-payout', admin, 'POST', body), call('/api/admin/record-vendor-payout', admin, 'POST', body)]);
    assert.ok(results.every(result => [200, 201].includes(result.status))); assert.equal(String(results[0].body.payout._id), String(results[1].body.payout._id));
    assert.equal((await call('/api/admin/record-vendor-payout', admin, 'POST', { ...body, amount: 51 })).status, 409);
    assert.equal((await call('/api/admin/record-vendor-payout', readonly, 'POST', body)).status, 403);
});


test('withdrawn health, report and ranking APIs are unavailable', async () => {
    for (const path of ['/api/admin/operations/health', '/api/admin/operations/exceptions', '/api/admin/reports/tat', '/api/admin/reports/reconciliation', '/api/admin/vendor-ranks']) assert.equal((await call(path)).status, 404);
    assert.equal((await call(`/api/admin/vendors/${customer._id}/rank`, admin, 'POST', {})).status, 404);
    assert.equal((await call(`/api/admin/operations/orders/${order._id}/acknowledge`, admin, 'POST', {})).status, 404);
});
