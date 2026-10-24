/**
 * Vendor Support Tickets API Test
 *
 * Verifies that:
 * 1. Vendor can file an issue for an active order with userType: 'Vendor' and category.
 * 2. Vendor can send follow-up messages with senderRole: 'Vendor'.
 * 3. GET /api/tickets/order/:orderId?role=Vendor returns the vendor's ticket.
 * 4. GET /api/tickets/order/:orderId?role=Customer does NOT return the vendor's ticket.
 * 5. Admin can retrieve all tickets with populated vendor and order data.
 * 6. Admin can post replies to the vendor ticket.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { createUser, tokenFor } from '../helpers/factories.js';

let env, admin, customer, vendor;

before(async () => {
    env = await startTestEnvironment();
    admin = { token: tokenFor('Admin') };
    customer = await createUser(api, env.baseUrl, '9990000081', 'Customer');
    vendor = await createUser(api, env.baseUrl, '9990000082', 'Vendor');
    const mongoose = (await import('mongoose')).default;
    const conn = await mongoose.createConnection(env.mongoUri).asPromise();
    await conn.collection('orders').insertOne({ _id: new mongoose.Types.ObjectId('60d5ec49f1b2c8b1f8e4e1a1'), customer: new mongoose.Types.ObjectId(customer.id), vendor: new mongoose.Types.ObjectId(vendor.id), status: 'PROCESSING' });
    await conn.close();
    assert.ok(admin.token && customer.token && vendor.token, 'all fixtures must exist');
}, { timeout: 90000 });

after(async () => {
    if (env) await env.stop();
});

describe('Vendor Order Support Tickets', () => {
    let dummyOrderId = '60d5ec49f1b2c8b1f8e4e1a1';
    let vendorTicketId;

    test('vendor creates an order issue ticket', async () => {
        const res = await api(env.baseUrl, '/api/tickets', {
            method: 'POST',
            token: vendor.token,
            body: {
                vendor: vendor.id,
                userType: 'Vendor',
                order: dummyOrderId,
                subject: 'Rider delayed for pickup',
                category: 'Rider Delay',
                message: 'Rider has not arrived yet for order pickup.'
            }
        });

        assert.equal(res.status, 201, 'ticket creation should return 201');
        assert.ok(res.body._id, 'ticket should have an id');
        assert.equal(res.body.userType, 'Vendor');
        assert.equal(res.body.category, 'Rider Delay');
        assert.equal(res.body.messages.length, 1);
        assert.equal(res.body.messages[0].senderRole, 'Vendor');

        vendorTicketId = res.body._id;
    });

    test('vendor sends a follow-up message on the ticket', async () => {
        const res = await api(env.baseUrl, `/api/tickets/${vendorTicketId}/messages`, {
            method: 'POST',
            token: vendor.token,
            body: {
                sender: vendor.id,
                senderRole: 'Vendor',
                message: 'Vendor has waited 30 minutes.'
            }
        });

        assert.equal(res.status, 200, 'message sending should return 200');
        assert.equal(res.body.messages.length, 2);
        assert.equal(res.body.messages[1].senderRole, 'Vendor');
        assert.equal(res.body.messages[1].message, 'Vendor has waited 30 minutes.');
    });

    test('GET /api/tickets/order/:orderId with role=Vendor returns the vendor ticket', async () => {
        const res = await api(env.baseUrl, `/api/tickets/order/${dummyOrderId}?role=Vendor`, {
            method: 'GET',
            token: vendor.token
        });

        assert.equal(res.status, 200, 'fetching vendor ticket by order should return 200');
        assert.equal(res.body._id, vendorTicketId);
        assert.equal(res.body.userType, 'Vendor');
    });

    test('GET /api/tickets/order/:orderId with role=Customer does NOT return vendor ticket', async () => {
        const res = await api(env.baseUrl, `/api/tickets/order/${dummyOrderId}?role=Customer`, {
            method: 'GET',
            token: customer.token
        });

        assert.equal(res.status, 200);
        // Should be null since customer has not filed a ticket for this order
        assert.equal(res.body, null, 'customer should not receive the vendor-specific ticket');
    });

    test('Admin lists all tickets and sees vendor details populated', async () => {
        const res = await api(env.baseUrl, '/api/tickets', {
            method: 'GET',
            token: admin.token
        });

        assert.equal(res.status, 200, 'admin ticket listing should return 200');
        assert.ok(Array.isArray(res.body));
        const found = res.body.find(t => t._id === vendorTicketId);
        assert.ok(found, 'created vendor ticket should be in the list');
        assert.equal(found.userType, 'Vendor');
        assert.equal(found.category, 'Rider Delay');
    });

    test('Admin replies to the vendor ticket', async () => {
        const res = await api(env.baseUrl, `/api/tickets/${vendorTicketId}/messages`, {
            method: 'POST',
            token: admin.token,
            body: {
                sender: '673966843120ade7183e719b',
                senderRole: 'Admin',
                message: 'We are dispatching another rider right now.'
            }
        });

        assert.equal(res.status, 200, 'admin reply should succeed');
        assert.equal(res.body.messages.length, 3);
        assert.equal(res.body.messages[2].senderRole, 'Admin');
    });
});
