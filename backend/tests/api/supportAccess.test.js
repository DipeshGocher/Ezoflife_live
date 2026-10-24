import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Order from '../../src/models/Order.js';
import Ticket from '../../src/models/Ticket.js';
import ServiceArea from '../../src/models/ServiceArea.js';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';

let env, admin, readonly, scoped, customer, other, vendor, supplier, order, outside, ticket;
const request = (path, actor, method = 'GET', body) => api(env.baseUrl, `/api/tickets${path}`, { method, body, token: actor && tokenFor(actor.role, String(actor._id)) });
const payload = { subject: 'Help with order', category: 'Others', description: 'Please assist' };
before(async () => {
    env = await startTestEnvironment({ env: { SHIPROCKET_ENABLED: 'false', WHATSAPP_ENABLED: 'false' } });
    await mongoose.connect(env.mongoUri);
    [admin, readonly, scoped, customer, other, vendor, supplier] = await User.create([
        { role: 'Admin' }, { role: 'Admin', adminAccessType: 'Read-Only' },
        { role: 'Admin', geofenceRestrictions: ['Allowed'] }, { role: 'Customer' },
        { role: 'Customer' }, { role: 'Vendor' }, { role: 'Supplier', status: 'pending' }
    ].map((data, index) => ({ status: 'approved', phone: `998800000${index}`, displayName: `Actor ${index}`, location: { lat: 1, lng: 1 }, ...data })));
    await ServiceArea.create({ areaName: 'Allowed', isActive: true, boundary: { type: 'Polygon', coordinates: [[[0,0],[2,0],[2,2],[0,2],[0,0]]] } });
    [order, outside] = await Order.create([1, 5].map(point => ({ customer: customer._id, vendor: vendor._id, pickupAddress: 'Pickup', dropAddress: 'Drop', pickupLocation: { lat: point, lng: point }, totalAmount: 100, items: [{ serviceId: 'test', name: 'Service', quantity: 1, price: 100 }] })));
    ticket = await Ticket.create({ ...payload, customer: customer._id, order: order._id });
    await Ticket.create({ ...payload, subject: 'Outside', customer: other._id, order: outside._id });
}, { timeout: 90000 });
after(async () => { await mongoose.disconnect(); if (env) await env.stop(); });

test('ticket reads require authentication and ownership', async () => {
    assert.equal((await request(`/${ticket._id}`)).status, 401);
    assert.equal((await request(`/${ticket._id}`, other)).status, 403);
    assert.equal((await request(`/customer/${customer._id}`, other)).status, 403);
    assert.equal((await request(`/order/${order._id}`, other)).status, 403);
    assert.equal((await request(`/${ticket._id}`, customer)).status, 200);
    assert.equal((await request(`/order/${order._id}`, customer)).body._id, String(ticket._id));
    assert.equal((await request(`/order/${order._id}`, vendor)).body, null);
    assert.equal((await request('/admin/all', customer)).status, 403);
});

test('creation derives identity and rejects unrelated orders', async () => {
    const res = await request('/create', customer, 'POST', { ...payload, customer: other._id });
    assert.equal(res.status, 201);
    assert.equal(res.body.customer, String(customer._id));
    assert.equal(res.body.messages[0].sender, String(customer._id));
    assert.equal((await request('/create', other, 'POST', { ...payload, orderId: order._id })).status, 403);
});

test('message identity cannot be spoofed and unauthorized changes leave storage untouched', async () => {
    const before = JSON.stringify(await Ticket.findById(ticket._id).lean());
    for (const [path, method, body] of [
        [`/${ticket._id}/message`, 'POST', { message: 'Intrusion' }],
        [`/${ticket._id}`, 'PUT', { subject: 'Intrusion' }],
        [`/${ticket._id}`, 'DELETE'],
        [`/admin/${ticket._id}/status`, 'PATCH', { status: 'Closed' }]
    ]) assert.equal((await request(path, other, method, body)).status, 403);
    assert.equal(JSON.stringify(await Ticket.findById(ticket._id).lean()), before);
    const res = await request(`/${ticket._id}/message`, customer, 'POST', { message: 'Real message', sender: admin._id, senderRole: 'Admin' });
    assert.equal(res.status, 200);
    assert.equal(res.body.messages.at(-1).sender, String(customer._id));
    assert.equal(res.body.messages.at(-1).senderRole, 'Customer');
    assert.equal(res.body.status, 'Open');
});

test('read-only admins can inspect but cannot write through generic ticket routes', async () => {
    assert.equal((await request(`/${ticket._id}`, readonly)).status, 200);
    assert.equal((await request(`/${ticket._id}/message`, readonly, 'POST', { message: 'No' })).status, 403);
    assert.equal((await request(`/${ticket._id}`, readonly, 'PUT', { subject: 'No' })).status, 403);
    assert.equal((await request(`/${ticket._id}`, readonly, 'DELETE')).status, 403);
});

test('scoped admin lists and mutations respect assigned service areas', async () => {
    const list = await request('/admin/all', scoped);
    assert.equal(list.status, 200);
    assert.ok(list.body.some(item => item._id === String(ticket._id)));
    assert.ok(list.body.every(item => item.subject !== 'Outside'));
    const denied = await Ticket.findOne({ subject: 'Outside' });
    assert.equal((await request(`/${denied._id}`, scoped)).status, 403);
    assert.equal((await request(`/admin/${denied._id}/status`, scoped, 'PATCH', { status: 'Closed' })).status, 403);
});

test('admin reply and valid resolution remain available; invalid statuses do not persist', async () => {
    const reply = await request(`/${ticket._id}/message`, admin, 'POST', { message: 'Assistance', sender: customer._id });
    assert.equal(reply.status, 200);
    assert.equal(reply.body.messages.at(-1).sender, String(admin._id));
    assert.equal(reply.body.status, 'In Progress');
    assert.equal((await request(`/admin/${ticket._id}/status`, admin, 'PATCH', { status: 'Invalid' })).status, 400);
    assert.equal((await Ticket.findById(ticket._id)).status, 'In Progress');
    assert.equal((await request(`/admin/${ticket._id}/status`, admin, 'PATCH', { status: 'Resolved' })).status, 200);
    assert.equal((await request(`/${ticket._id}`, customer, 'PUT', { subject: 'No' })).status, 400);
});

test('vendor, supplier, pending and revision accounts retain their own support access', async () => {
    for (const actor of [vendor, supplier]) {
        const created = await request('/create', actor, 'POST', payload);
        assert.equal(created.status, 201);
        assert.equal((await request(`/${created.body._id}`, actor)).status, 200);
    }
    await User.updateOne({ _id: supplier._id }, { status: 'revision_required' });
    assert.equal((await request(`/customer/${supplier._id}`, supplier)).status, 200);
    await User.updateOne({ _id: other._id }, { status: 'rejected', onboardingStage: 'INITIAL_REVIEW' });
    assert.equal((await request(`/customer/${other._id}`, other)).status, 200);
});

test('blocked, deleted and rejected accounts lose access with existing tokens', async () => {
    const oldToken = tokenFor('Customer', String(other._id));
    await User.updateOne({ _id: other._id }, { isBlocked: true });
    assert.equal((await api(env.baseUrl, `/api/tickets/customer/${other._id}`, { token: oldToken })).status, 403);
    await User.updateOne({ _id: supplier._id }, { status: 'rejected' });
    assert.equal((await request(`/customer/${supplier._id}`, supplier)).status, 403);
    await User.deleteOne({ _id: other._id });
    assert.equal((await api(env.baseUrl, `/api/tickets/customer/${other._id}`, { token: oldToken })).status, 403);
});

test('malformed and missing ticket ids return client errors', async () => {
    assert.equal((await request('/invalid', admin)).status, 400);
    assert.equal((await request(`/${new mongoose.Types.ObjectId()}`, admin)).status, 404);
});


test('admin blocking and unblocking apply to an existing session without changing status badges', async () => {
    const account = await User.create({ phone: '9988000099', role: 'Customer', status: 'approved' });
    const token = tokenFor('Customer', String(account._id));
    const toggle = () => api(env.baseUrl, `/api/admin/users/${account._id}/toggle-status`, { method: 'PATCH', token: tokenFor('Admin', String(admin._id)) });
    const blocked = await toggle();
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.user.status, 'rejected');
    assert.equal(blocked.body.user.isBlocked, true);
    assert.equal((await api(env.baseUrl, `/api/tickets/customer/${account._id}`, { token })).status, 403);
    const enabled = await toggle();
    assert.equal(enabled.status, 200);
    assert.equal(enabled.body.user.status, 'approved');
    assert.equal(enabled.body.user.isBlocked, false);
    assert.equal((await api(env.baseUrl, `/api/tickets/customer/${account._id}`, { token })).status, 200);
});
