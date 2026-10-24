import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Order from '../../src/models/Order.js';
import Ticket from '../../src/models/Ticket.js';
import ServiceArea from '../../src/models/ServiceArea.js';
import { initSocket, getEventPublisher } from '../../src/socket.js';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';
const requireClient = createRequire(new URL('../../../frontend/package.json', import.meta.url));
const { io: connect } = requireClient('socket.io-client');

let env, server, socketServer, url, customer, other, admin, scoped, readonly, vendor, rider, supplier, order, outside, ticket, outsideTicket;
const clients = [];
const token = actor => tokenFor(actor.role, String(actor._id));
const clientFor = async (actor, options = {}) => {
    const client = connect(options.url || url, { auth: { token: options.token ?? (actor ? token(actor) : undefined) }, transports: options.transports || ['websocket'], reconnection: false, forceNew: true, autoConnect: false });
    clients.push(client);
    const result = new Promise((resolve, reject) => { client.once('connect', () => resolve(client)); client.once('connect_error', reject); });
    client.connect();
    return result;
};
const join = (client, room) => client.timeout(3000).emitWithAck('join_room', room);
const noEvent = async (client, event, act) => {
    const messages = [];
    const listen = message => messages.push(message);
    client.on(event, listen);
    await act();
    // Socket.IO delivery is asynchronous even after the publisher completes.
    await new Promise(resolve => setTimeout(resolve, 100));
    client.off(event, listen);
    assert.deepEqual(messages, []);
};
before(async () => {
    process.env.JWT_SECRET ||= 'test_secret_key';
    env = await startTestEnvironment({ env: { SHIPROCKET_ENABLED: 'false', WHATSAPP_ENABLED: 'false' } });
    await mongoose.connect(env.mongoUri);
    [customer, other, admin, scoped, readonly, vendor, rider, supplier] = await User.create([
        { role: 'Customer' }, { role: 'Customer' }, { role: 'Admin' },
        { role: 'Admin', geofenceRestrictions: ['Allowed'] }, { role: 'Admin', adminAccessType: 'Read-Only' },
        { role: 'Vendor' }, { role: 'Rider' }, { role: 'Supplier', status: 'pending' }
    ].map((value, index) => ({ phone: `997700000${index}`, status: 'approved', location: { lat: 1, lng: 1 }, ...value })));
    await ServiceArea.create({ areaName: 'Allowed', isActive: true, boundary: { type: 'Polygon', coordinates: [[[0,0],[2,0],[2,2],[0,2],[0,0]]] } });
    [order, outside] = await Order.create([1,5].map(point => ({ customer: customer._id, vendor: vendor._id, rider: rider._id, pickupAddress: 'Pickup', dropAddress: 'Drop', pickupLocation: { lat: point, lng: point }, totalAmount: 100, items: [{ serviceId: 'test', name: 'Service', quantity: 1, price: 100 }] })));
    [ticket, outsideTicket] = await Ticket.create([order, outside].map(value => ({ customer: customer._id, order: value._id, subject: 'Help', description: 'Please assist' })));
    server = createServer();
    socketServer = initSocket(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
}, { timeout: 90000 });
afterEach(() => { for (const client of clients.splice(0)) client.disconnect(); });
after(async () => { if (socketServer) await new Promise(resolve => socketServer.close(resolve)); await mongoose.disconnect(); if (env) await env.stop(); });

test('handshakes reject anonymous, malformed, expired and nonexistent sessions', async () => {
    for (const raw of [undefined, 'bad-token', tokenFor('Customer', String(new mongoose.Types.ObjectId())), jwt.sign({ id: String(customer._id), role: 'Customer' }, process.env.JWT_SECRET, { expiresIn: -1 })]) {
        await assert.rejects(clientFor(null, { token: raw }), /Authentication required/);
    }
});

test('authenticated websocket and polling transports retain support access', async () => {
    const client = await clientFor(supplier, { transports: ['polling'] });
    assert.equal((await join(client, `user_${supplier._id}`)).ok, true);
    assert.equal((await join(await clientFor(customer), `ticket_${ticket._id}`)).ok, true);
});

test('customers cannot join another identity, ticket, order or privileged pools', async () => {
    const client = await clientFor(other);
    for (const room of [`user_${customer._id}`, `ticket_${ticket._id}`, `order_${order._id}`, 'admins_pool', 'vendors_pool', 'arbitrary', {}, null, 'a'.repeat(101)]) {
        assert.equal((await join(client, room)).ok, false);
    }
    assert.equal((await join(client, `user_${other._id}`)).ok, true);
});

test('assigned vendor and rider can track their order but cannot read customer chat', async () => {
    for (const actor of [vendor, rider]) {
        const client = await clientFor(actor);
        assert.equal((await join(client, `order_${order._id}`)).ok, true);
        assert.equal((await join(client, `ticket_${ticket._id}`)).ok, false);
    }
    assert.equal((await join(await clientFor(vendor), 'vendors_pool')).ok, true);
});

test('read-only admins can subscribe; scoped admin order/ticket rooms enforce zones', async () => {
    assert.equal((await join(await clientFor(readonly), `ticket_${ticket._id}`)).ok, true);
    const client = await clientFor(scoped);
    assert.equal((await join(client, 'admins_pool')).ok, true);
    assert.equal((await join(client, `order_${order._id}`)).ok, true);
    assert.equal((await join(client, `ticket_${ticket._id}`)).ok, true);
    assert.equal((await join(client, `order_${outside._id}`)).ok, false);
    assert.equal((await join(client, `ticket_${outsideTicket._id}`)).ok, false);
});

test('authorized room delivery and leave acknowledgements work', async () => {
    const client = await clientFor(customer);
    const room = `ticket_${ticket._id}`;
    assert.equal((await join(client, room)).ok, true);
    const received = once(client, 'new_message');
    await getEventPublisher().to(room).emit('new_message', { ticketId: String(ticket._id), message: { message: 'Hello' } });
    assert.equal((await received)[0].message.message, 'Hello');
    assert.equal((await client.timeout(3000).emitWithAck('leave_room', room)).ok, true);
    await noEvent(client, 'new_message', () => getEventPublisher().to(room).emit('new_message', { message: 'After leave' }));
});

test('real HTTP support replies reach authenticated ticket subscribers with saved identity', async () => {
    const client = await clientFor(customer, { url: env.baseUrl });
    await join(client, `ticket_${ticket._id}`);
    const received = once(client, 'new_message');
    const response = await api(env.baseUrl, `/api/tickets/${ticket._id}/message`, { method: 'POST', token: token(admin), body: { message: 'Support reply', sender: other._id } });
    assert.equal(response.status, 200);
    const event = (await received)[0];
    assert.equal(event.message.sender, String(admin._id));
    assert.ok(event.message._id);
    assert.ok(event.message.createdAt);
});

test('reconnect requires rejoining and restores authorized subscriptions', async () => {
    const client = await clientFor(customer);
    await join(client, `ticket_${ticket._id}`);
    client.disconnect();
    const reconnected = once(client, 'connect'); client.connect(); await reconnected;
    assert.equal((await join(client, `ticket_${ticket._id}`)).ok, true);
    const received = once(client, 'status_updated');
    await getEventPublisher().to(`ticket_${ticket._id}`).emit('status_updated', { status: 'Resolved' });
    assert.equal((await received)[0].status, 'Resolved');
});

test('new-ticket admin feed filters each event by current geofence scope', async () => {
    const client = await clientFor(scoped); await join(client, 'admins_pool');
    await noEvent(client, 'new_ticket', () => getEventPublisher().to('admins_pool').emit('new_ticket', { ticketId: String(outsideTicket._id) }));
    const received = once(client, 'new_ticket');
    await getEventPublisher().to('admins_pool').emit('new_ticket', { ticketId: String(ticket._id) });
    assert.equal((await received)[0].ticketId, String(ticket._id));
});

test('global notifications are delivered to the recipient and not unrelated customers', async () => {
    const owner = await clientFor(vendor); const outsider = await clientFor(other);
    const received = once(owner, 'new_notification');
    await noEvent(outsider, 'new_notification', () => getEventPublisher().emit('new_notification', { recipient: String(vendor._id), role: 'vendor', notification: { title: 'Private job applicant' } }));
    assert.equal((await received)[0].notification.title, 'Private job applicant');
    await noEvent(outsider, 'unknown_global', () => getEventPublisher().emit('unknown_global', { secret: true }));
});

test('reassigned orders stop delivering to previously assigned room members', async () => {
    const client = await clientFor(rider); await join(client, `order_${order._id}`);
    await User.updateOne({ _id: other._id }, { role: 'Rider' });
    await Order.updateOne({ _id: order._id }, { rider: other._id });
    await noEvent(client, 'order_status_update', () => getEventPublisher().to(`order_${order._id}`).emit('order_status_update', { _id: String(order._id), status: 'PROCESSING' }));
    await Order.updateOne({ _id: order._id }, { rider: rider._id });
    await User.updateOne({ _id: other._id }, { role: 'Customer' });
});

test('scope changes and role changes affect existing subscribers before delivery', async () => {
    const client = await clientFor(scoped); await join(client, `ticket_${ticket._id}`);
    await User.updateOne({ _id: scoped._id }, { geofenceRestrictions: ['Elsewhere'] });
    await noEvent(client, 'new_message', () => getEventPublisher().to(`ticket_${ticket._id}`).emit('new_message', { message: 'Private' }));
    await User.updateOne({ _id: scoped._id }, { geofenceRestrictions: ['Allowed'] });
    const demoted = await clientFor(admin); await join(demoted, 'admins_pool');
    await User.updateOne({ _id: admin._id }, { role: 'Customer' });
    await noEvent(demoted, 'new_ticket', () => getEventPublisher().to('admins_pool').emit('new_ticket', { ticketId: String(ticket._id) }));
    await User.updateOne({ _id: admin._id }, { role: 'Admin' });
});

test('blocked and deleted subscribers cannot receive further room events', async () => {
    for (const action of ['block', 'delete']) {
        const account = await User.create({ phone: action === 'block' ? '9977000098' : '9977000099', role: 'Customer', status: 'approved' });
        const client = await clientFor(account); await join(client, `user_${account._id}`);
        if (action === 'block') await User.updateOne({ _id: account._id }, { isBlocked: true });
        else await User.deleteOne({ _id: account._id });
        const disconnected = once(client, 'disconnect');
        await noEvent(client, 'push_notification', () => getEventPublisher().to(`user_${account._id}`).emit('push_notification', { title: 'Denied' }));
        await disconnected;
        await assert.rejects(clientFor(account), /Authentication required/);
    }
});


test('an idle connected session disconnects when its token expires', async () => {
    const raw = jwt.sign({ id: String(customer._id), role: 'Customer' }, process.env.JWT_SECRET, { expiresIn: 2 });
    const client = await clientFor(customer, { token: raw });
    const disconnected = once(client, 'disconnect');
    await disconnected;
    assert.equal(client.connected, false);
});

test('queued joins and leaves cannot resurrect a page subscription', async () => {
    const client = await clientFor(customer);
    const room = `ticket_${ticket._id}`;
    client.emit('join_room', room);
    await client.timeout(3000).emitWithAck('leave_room', room);
    await noEvent(client, 'new_message', () => getEventPublisher().to(room).emit('new_message', { message: 'After immediate leave' }));
});

test('resource events preserve publication order', async () => {
    const client = await clientFor(customer); const room = `ticket_${ticket._id}`; await join(client, room);
    const messages = [];
    const done = new Promise(resolve => client.on('new_message', data => { messages.push(data.index); if (messages.length === 3) resolve(); }));
    await Promise.all([1,2,3].map(index => getEventPublisher().to(room).emit('new_message', { index })));
    await done;
    assert.deepEqual(messages, [1,2,3]);
});
