import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { api, startTestEnvironment, FIXTURE_SERVICE_ID } from '../helpers/testEnvironment.js';

let env, db;
const areaId = new mongoose.Types.ObjectId();
before(async () => {
    env = await startTestEnvironment();
    db = await mongoose.createConnection(env.mongoUri).asPromise();
    await db.collection('masterservices').updateOne({ _id: new mongoose.Types.ObjectId(FIXTURE_SERVICE_ID) }, {
        $set: { basePrice: 200, discountedPrice: 10, tier: 'Essential' }
    });
    await db.collection('serviceareas').insertOne({
        _id: areaId, areaName: 'Pricing test', isActive: true, allowDiscount: true,
        multiplier: 8, basePriceMultiplier: 2, platformMultiplier: 1.1, heritageMultiplier: 1.5,
        boundary: { type: 'Polygon', coordinates: [[[73,20],[74,20],[74,21],[73,21],[73,20]]] }
    });
    await db.collection('systemconfigs').insertMany([
        { key: 'normal_logistics_fee', value: 50 },
        { key: 'essential_fee', value: 999 },
    ]);
}, { timeout: 90000 });
after(async () => { await db?.close(); await env?.stop(); });

test('admin preview uses checkout discounts, current area factor, fees and GST', async () => {
    const response = await api(env.baseUrl, `/api/master-services/preview?area_id=${areaId}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const row = response.body.find(r => r.serviceId === FIXTURE_SERVICE_ID);
    assert.equal(row.basePrice, 200);
    assert.equal(row.vendorRate, 20);
    assert.equal(row.areaMultiplier, 2);
    assert.equal(row.finalPrice, 82.36);
});

test('admin preview switches to base price when regional discounts are disabled', async () => {
    await db.collection('serviceareas').updateOne({ _id: areaId }, { $set: { allowDiscount: false } });
    const response = await api(env.baseUrl, `/api/master-services/preview?area_id=${areaId}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const row = response.body.find(r => r.serviceId === FIXTURE_SERVICE_ID);
    assert.equal(row.vendorRate, 400);
    assert.equal(row.finalPrice, 526.2);
});
