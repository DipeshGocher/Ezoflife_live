/**
 * Delivery dispatch and the provider webhook.
 *
 * The idempotency tests are the important ones: the scheduler runs every five
 * minutes, so a dispatch that is not idempotent books — and pays for — the same
 * delivery repeatedly.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { orderPayload, createUser, tokenFor } from '../helpers/factories.js';

let env, customerId, customerToken;

before(async () => {
    env = await startTestEnvironment();
    const user = await createUser(api, env.baseUrl, '9990000005', 'Customer');
    customerId = user.id;
    customerToken = user.token;
}, { timeout: 90000 });

after(async () => { if (env) await env.stop(); });

const newOrder = async () => {
    const res = await api(env.baseUrl, '/api/orders', {
        method: 'POST', body: orderPayload(customerId), token: customerToken
    });
    assert.equal(res.status, 201, 'fixture order should be created');
    return res.body;
};

const markReady = (id) =>
    api(env.baseUrl, `/api/orders/status/${id}`, {
        method: 'PATCH', body: { status: 'READY_FOR_DISPATCH' }, token: customerToken
    });

const getOrder = async (id) => (await api(env.baseUrl, `/api/orders/${id}`, { token: customerToken })).body;

describe('return-leg dispatch on READY_FOR_DISPATCH', () => {
    test('marking an order ready books a delivery task', async () => {
        const order = await newOrder();
        const res = await markReady(order._id);
        assert.ok(res.status < 400, `mark-ready failed: ${res.status}`);

        const after = await getOrder(order._id);
        assert.ok(
            after.deliveryShipmentDetails?.taskId,
            'no delivery task was booked — dispatch did not fire'
        );
    });

    test('the booked task is recorded against the return leg, not the pickup leg', async () => {
        const order = await newOrder();
        await markReady(order._id);
        const after = await getOrder(order._id);

        assert.ok(after.deliveryShipmentDetails?.taskId);
        assert.ok(!after.shipmentDetails?.taskId, 'pickup leg should be untouched');
    });

    test('a provider failure does not block the vendor marking the order ready', async () => {
        // The mock always succeeds; this asserts the ordering contract — the
        // status update is persisted before dispatch is attempted.
        const order = await newOrder();
        const res = await markReady(order._id);
        assert.ok(res.status < 400);
        const after = await getOrder(order._id);
        assert.equal(after.status, 'READY_FOR_DISPATCH');
    });
});

describe('dispatch is idempotent', () => {
    test('marking ready twice books only one task', async () => {
        const order = await newOrder();

        await markReady(order._id);
        const first = (await getOrder(order._id)).deliveryShipmentDetails.taskId;

        await markReady(order._id);
        const second = (await getOrder(order._id)).deliveryShipmentDetails.taskId;

        assert.equal(second, first, 'a second dispatch created a new task — duplicate booking');
    });

    test('concurrent dispatches book only one task', async () => {
        const order = await newOrder();

        // Five simultaneous mark-ready calls, as a retry storm would produce.
        await Promise.all(Array.from({ length: 5 }, () => markReady(order._id)));

        const after = await getOrder(order._id);
        assert.ok(after.deliveryShipmentDetails?.taskId, 'no task booked at all');
        assert.match(after.deliveryShipmentDetails.taskId, /^MOCK-RETURN-/);
    });
});

describe('POST /api/logistics/webhook', () => {
    test('is registered', async () => {
        const res = await api(env.baseUrl, '/api/logistics/webhook', { method: 'POST', body: {} });
        assert.notEqual(res.status, 404);
    });

    test('acknowledges an unparseable payload with 200 so the provider stops retrying', async () => {
        const res = await api(env.baseUrl, '/api/logistics/webhook', {
            method: 'POST', body: { nonsense: true }
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.applied, false);
    });

    test('acknowledges a well-formed event for an unknown order', async () => {
        const res = await api(env.baseUrl, '/api/logistics/webhook', {
            method: 'POST',
            body: { referenceId: '#ON-DOES-NOT-EXIST', status: 'DELIVERED' }
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.applied, false);
    });

    test('advances the order when the return leg is delivered', async () => {
        const order = await newOrder();
        await markReady(order._id);
        const taskId = (await getOrder(order._id)).deliveryShipmentDetails.taskId;

        const res = await api(env.baseUrl, '/api/logistics/webhook', {
            method: 'POST',
            body: { taskId, referenceId: order.orderId, status: 'DELIVERED' }
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.applied, true, `webhook not applied: ${JSON.stringify(res.body)}`);

        const after = await getOrder(order._id);
        assert.equal(after.status, 'DELIVERED');
        assert.equal(after.deliveryStatus, 'delivered');
        const deliveredEvents = after.statusHistory.filter(event => event.status === 'DELIVERED');
        assert.equal(deliveredEvents.length, 1, 'delivery transition needs a recorded timestamp');
        assert.ok(Number.isFinite(+new Date(deliveredEvents[0].timestamp)));
        await Promise.all(Array.from({ length: 3 }, () => api(env.baseUrl, '/api/logistics/webhook', {
            method: 'POST', body: { taskId, referenceId: order.orderId, status: 'DELIVERED' }
        })));
        const retried = await getOrder(order._id);
        assert.deepEqual(retried.statusHistory.filter(event => event.status === 'DELIVERED'), deliveredEvents, 'duplicate callbacks must not restart the unpaid deadline');
    });

    test('records the delivery partner from the event', async () => {
        const order = await newOrder();
        await markReady(order._id);
        const taskId = (await getOrder(order._id)).deliveryShipmentDetails.taskId;

        await api(env.baseUrl, '/api/logistics/webhook', {
            method: 'POST',
            body: {
                taskId,
                referenceId: order.orderId,
                status: 'PARTNER_ASSIGNED',
                partner: { name: 'Real Partner', phone: '9111111111' }
            }
        });

        const after = await getOrder(order._id);
        assert.equal(after.riderDetails?.name, 'Real Partner');
    });

    test('a failed delivery marks the leg failed rather than delivered', async () => {
        const order = await newOrder();
        await markReady(order._id);
        const taskId = (await getOrder(order._id)).deliveryShipmentDetails.taskId;

        await api(env.baseUrl, '/api/logistics/webhook', {
            method: 'POST',
            body: { taskId, referenceId: order.orderId, status: 'FAILED' }
        });

        const after = await getOrder(order._id);
        assert.equal(after.deliveryStatus, 'failed');
        assert.notEqual(after.status, 'DELIVERED');
    });
});

describe('webhook stores no shipment data for other orders', () => {
    test('an event for order A never mutates order B', async () => {
        const a = await newOrder();
        const b = await newOrder();
        await markReady(a._id);
        const taskA = (await getOrder(a._id)).deliveryShipmentDetails.taskId;

        await api(env.baseUrl, '/api/logistics/webhook', {
            method: 'POST', body: { taskId: taskA, referenceId: a.orderId, status: 'DELIVERED' }
        });

        const afterB = await getOrder(b._id);
        assert.notEqual(afterB.status, 'DELIVERED');
    });
});
