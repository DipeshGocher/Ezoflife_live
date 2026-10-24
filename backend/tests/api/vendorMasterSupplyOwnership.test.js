import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { api, startTestEnvironment } from '../helpers/testEnvironment.js';
import { createUser } from '../helpers/factories.js';
import VendorMasterSupply from '../../src/models/VendorMasterSupply.js';

let env;
let owner;
let otherSupplier;
let vendor;
let product;

before(async () => {
    env = await startTestEnvironment();
    owner = await createUser(api, env.baseUrl, '9990008311', 'Supplier');
    otherSupplier = await createUser(api, env.baseUrl, '9990008322', 'Supplier');
    vendor = await createUser(api, env.baseUrl, '9990008333', 'Vendor');
    await mongoose.connect(env.mongoUri);

    product = await VendorMasterSupply.create({
        skuId: 'TEST-SKU-OWN-1',
        serialNumber: 990001,
        categoryId: new mongoose.Types.ObjectId(),
        materialName: 'Owned Detergent',
        quantity: '1 kg',
        wholesaleRate: 100,
        supplierId: 'SUP-8311', // owner's phone suffix
        approvalStatus: 'Approved'
    });
}, { timeout: 90000 });

after(async () => {
    await mongoose.disconnect().catch(() => {});
    if (env) await env.stop();
});

const path = () => `/api/vendor-master-supplies/${product._id}`;

describe('supplier product ownership', () => {
    test('a supplier can edit their own product with their own token', async () => {
        const res = await api(env.baseUrl, path(), {
            method: 'PUT',
            token: owner.token,
            body: { wholesaleRate: 120, approvalStatus: 'Approved', supplierId: 'SUP-8322', adminMessage: 'self-approved' }
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.wholesaleRate, 120);
        assert.equal(res.body.approvalStatus, 'Pending', 'supplier edits go back to admin review');
        assert.equal(res.body.supplierId, 'SUP-8311', 'supplier cannot reassign ownership');
        assert.notEqual(res.body.adminMessage, 'self-approved');
    });

    test('other suppliers and vendors cannot edit or delete it', async () => {
        for (const user of [otherSupplier, vendor]) {
            const put = await api(env.baseUrl, path(), { method: 'PUT', token: user.token, body: { wholesaleRate: 1 } });
            assert.equal(put.status, 403);
            const del = await api(env.baseUrl, path(), { method: 'DELETE', token: user.token });
            assert.equal(del.status, 403);
        }
        const stored = await VendorMasterSupply.findById(product._id).lean();
        assert.equal(stored.wholesaleRate, 120);
    });

    test('an invalid token is rejected', async () => {
        const res = await api(env.baseUrl, path(), { method: 'PUT', token: 'null', body: { wholesaleRate: 1 } });
        assert.equal(res.status, 401);
    });

    test('the owner can delete their product', async () => {
        const res = await api(env.baseUrl, path(), { method: 'DELETE', token: owner.token });
        assert.equal(res.status, 200);
        assert.equal(await VendorMasterSupply.countDocuments({ _id: product._id }), 0);
    });
});
