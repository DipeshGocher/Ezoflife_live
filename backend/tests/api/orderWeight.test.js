/**
 * Order weight: never a made-up number.
 *
 * Source priority: weighed (vendor) > estimated (quantities multiplied by the
 * admin-configured Master Service avg weight) > null ("—").
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { orderPayload, createUser, tokenFor } from '../helpers/factories.js';
import MasterService from '../../src/models/MasterService.js';
import Order from '../../src/models/Order.js';
import { parseWeightKg, isInvalidWeight, resolveOrderWeight, backfillMissingOrderWeights } from '../../src/utils/orderWeight.js';

let env, customer, vendor, otherVendor, shirtId, noWeightId;

before(async () => {
    env = await startTestEnvironment();
    customer = await createUser(api, env.baseUrl, '9990000081', 'Customer');
    vendor = await createUser(api, env.baseUrl, '9990000082', 'Vendor');
    otherVendor = await createUser(api, env.baseUrl, '9990000083', 'Vendor');

    await mongoose.connect(env.mongoUri);
    const categoryId = new mongoose.Types.ObjectId();
    const [shirt, blank] = await MasterService.create([
        { itemName: 'Shirt', categoryId, avgWeight: '0.25' },
        { itemName: 'Mystery', categoryId, avgWeight: '' }
    ]);
    shirtId = String(shirt._id);
    noWeightId = String(blank._id);
}, { timeout: 90000 });

after(async () => {
    await mongoose.disconnect();
    if (env) await env.stop();
});

const placeOrder = (overrides) =>
    api(env.baseUrl, '/api/orders', {
        method: 'POST', body: orderPayload(customer.id, overrides), token: customer.token
    });

const item = (serviceId, quantity, unit = 'pc') => ({ serviceId, name: 'x', quantity, price: 50, unit });

describe('weight helpers', () => {
    test('parseWeightKg accepts 0 < w <= 200 and rounds to 10 g', () => {
        assert.equal(parseWeightKg('3.456'), 3.46);
        assert.equal(parseWeightKg(200), 200);
        for (const bad of [0, -1, 200.01, 'abc', null, undefined, '']) assert.equal(parseWeightKg(bad), null);
    });

    test('isInvalidWeight only flags supplied-but-bad values', () => {
        assert.equal(isInvalidWeight(undefined), false);
        assert.equal(isInvalidWeight(''), false);
        assert.equal(isInvalidWeight(0), true);
        assert.equal(isInvalidWeight('x'), true);
        assert.equal(isInvalidWeight(2), false);
    });

    test('resolveOrderWeight prefers weighed > admin estimate', () => {
        assert.deepEqual(resolveOrderWeight({ weighedWeight: 5, estimatedWeight: 2 }), { totalWeight: 5, weightSource: 'weighed' });
        assert.deepEqual(resolveOrderWeight({ estimatedWeight: 2 }), { totalWeight: 2, weightSource: 'estimated' });
        assert.deepEqual(resolveOrderWeight({}), { totalWeight: null, weightSource: null });
    });
});

describe('customer orders', () => {
    test('legacy client approx weight is ignored in favour of admin-configured weights', async () => {
        const res = await placeOrder({ items: [item(shirtId, 4)], approxWeight: 3.5 });
        assert.equal(res.status, 201);
        assert.equal(res.body.totalWeight, 1);
        assert.equal(res.body.weightSource, 'estimated');
        assert.equal(res.body.customerWeight, null);
        assert.equal(res.body.estimatedWeight, 1, '4 shirts x 0.25 kg');
    });

    test('without approx weight it is estimated from kg quantities + avg weights', async () => {
        const res = await placeOrder({ items: [item(shirtId, 4), item('000000000000000000000001', 2.5, 'kg')] });
        assert.equal(res.status, 201);
        assert.equal(res.body.totalWeight, 3.5);
        assert.equal(res.body.weightSource, 'estimated');
    });

    test('unknown piece weight -> no weight at all (not a random number)', async () => {
        const res = await placeOrder({ items: [item(shirtId, 2), item(noWeightId, 1)] });
        assert.equal(res.status, 201);
        assert.equal(res.body.totalWeight, null);
        assert.equal(res.body.weightSource, null);
    });

    test('client-sent item weights are ignored', async () => {
        const res = await placeOrder({ items: [{ ...item(noWeightId, 1), weight: 99 }] });
        assert.equal(res.status, 201);
        assert.equal(res.body.totalWeight, null);
        assert.ok(res.body.items.every(i => i.weight == null));
    });

    test('legacy invalid approx weight is ignored', async () => {
        for (const approxWeight of [0, -2, 500, 'heavy']) {
            const res = await placeOrder({ items: [item(shirtId, 2)], approxWeight });
            assert.equal(res.status, 201, `approxWeight=${approxWeight}`);
            assert.equal(res.body.totalWeight, 0.5);
            assert.equal(res.body.weightSource, 'estimated');
        }
    });
});

describe('walk-in orders require a weighed weight', () => {
    const walkIn = (extra = {}) => api(env.baseUrl, '/api/orders/walk-in', {
        method: 'POST',
        token: vendor.token,
        body: {
            customerPhone: '9990000084', customerName: 'Walk In', vendorId: vendor.id,
            items: [item(shirtId, 3)], totalAmount: 150, status: 'PROCESSING', ...extra
        }
    });

    test('missing or invalid weight -> 400', async () => {
        for (const weight of [undefined, '', 0, 250]) {
            const res = await walkIn(weight === undefined ? {} : { weight });
            assert.equal(res.status, 400, `weight=${weight}`);
            assert.match(res.body.message, /weight/i);
        }
    });

    test('valid weight is stored as weighed', async () => {
        const res = await walkIn({ weight: 2.75 });
        assert.equal(res.status, 201);
        const order = await Order.findById(res.body._id).lean();
        assert.equal(order.totalWeight, 2.75);
        assert.equal(order.weightSource, 'weighed');
        assert.ok(order.weighedAt);
    });
});

describe('vendor records the weighed weight', () => {
    let orderId;
    const record = (weight, token = vendor.token, id = orderId) =>
        api(env.baseUrl, `/api/orders/${id}/weight`, { method: 'PATCH', token, body: { weight } });

    before(async () => {
        const res = await placeOrder({ items: [item(shirtId, 4)] });
        orderId = res.body._id;
        await Order.updateOne({ _id: orderId }, { vendor: vendor.id, status: 'ORDER_PLACED' });
    });

    test('not allowed before the clothes reach the vendor', async () => {
        const res = await record(4);
        assert.equal(res.status, 400);
    });

    test('another vendor or the customer cannot record it', async () => {
        await Order.updateOne({ _id: orderId }, { status: 'RECEIVED_BY_VENDOR' });
        assert.equal((await record(4, otherVendor.token)).status, 403);
        assert.equal((await record(4, customer.token)).status, 403);
    });

    test('invalid weight -> 400, unknown order -> 404', async () => {
        assert.equal((await record(0)).status, 400);
        assert.equal((await record(4, vendor.token, '60000000000000000000000b')).status, 404);
    });

    test('the handling vendor records it; it overrides the configured estimate', async () => {
        const res = await record(4.2);
        assert.equal(res.status, 200);
        assert.deepEqual(
            { totalWeight: res.body.weight.totalWeight, weightSource: res.body.weight.weightSource, customerWeight: res.body.weight.customerWeight },
            { totalWeight: 4.2, weightSource: 'weighed', customerWeight: null }
        );
        const order = await Order.findById(orderId).lean();
        assert.equal(order.totalWeight, 4.2);
        assert.equal(order.weighedWeight, 4.2);
        assert.equal(order.weightSource, 'weighed');
    });

    test('admin can correct it at any status', async () => {
        await Order.updateOne({ _id: orderId }, { status: 'DELIVERED' });
        const res = await record(4.4, tokenFor('Admin'));
        assert.equal(res.status, 200);
        assert.equal(res.body.weight.totalWeight, 4.4);
    });
});

// Kept last: the backfill scans every order in the test DB.
describe('backfilling orders saved without a weight', () => {
    test('fills the Avg Weight estimate, never overwrites a weighed order, leaves unknowns as null', async () => {
        const base = { customer: new mongoose.Types.ObjectId(), status: 'DELIVERED', totalAmount: 100, createdAt: new Date() };
        const { insertedIds } = await Order.collection.insertMany([
            // legacy order: field missing entirely (created before weights existed)
            { ...base, orderId: '#BF-1', items: [{ serviceId: shirtId, name: 'Shirt', quantity: 4, unit: 'pc' }] },
            { ...base, orderId: '#BF-2', items: [{ serviceId: shirtId, name: 'Shirt', quantity: 1, unit: 'pc' }], totalWeight: 7, weightSource: 'weighed' },
            { ...base, orderId: '#BF-3', items: [{ serviceId: noWeightId, name: 'Mystery', quantity: 1, unit: 'pc' }], totalWeight: null }
        ]);

        const preview = await backfillMissingOrderWeights(Order, { dryRun: true });
        assert.ok(preview.updated.some(row => row.orderId === '#BF-1' && row.totalWeight === 1));
        assert.equal((await Order.findById(insertedIds[0]).lean()).totalWeight, undefined, 'dry run writes nothing');

        const result = await backfillMissingOrderWeights(Order);
        assert.ok(result.skipped.includes('#BF-3'));
        const [legacy, weighed, unknown] = await Promise.all(Object.values(insertedIds).map(id => Order.findById(id).lean()));
        assert.equal(legacy.totalWeight, 1, '4 shirts x 0.25 kg');
        assert.equal(legacy.weightSource, 'estimated');
        assert.equal(weighed.totalWeight, 7);
        assert.equal(weighed.weightSource, 'weighed');
        assert.equal(unknown.totalWeight, null);
    });
});
