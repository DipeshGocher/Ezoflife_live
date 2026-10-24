/**
 * Account endpoints addressed by id/phone must only act for that account (or
 * an Admin), never leak login secrets, and never let a user grant themselves
 * admin access. Also covers the removed test backdoors and production guards.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor, createUser } from '../helpers/factories.js';

let env, alice, bob, vendor, master;

before(async () => {
    env = await startTestEnvironment();
    alice = await createUser(api, env.baseUrl, '9811100001');
    bob = await createUser(api, env.baseUrl, '9811100002');
    vendor = await createUser(api, env.baseUrl, '9811100003', 'Vendor');
    const conn = await mongoose.createConnection(env.mongoUri).asPromise();
    await conn.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(vendor.id) }, { $set: { status: 'approved' } });
    await conn.close();
    master = tokenFor('Admin');
}, { timeout: 90000 });

after(async () => { if (env) await env.stop(); });

const as = (token) => (path, method = 'GET', body) => api(env.baseUrl, path, { method, token, body });

describe('profile read', () => {
    test('needs a login', async () => {
        assert.equal((await api(env.baseUrl, `/api/auth/profile/${alice.id}`)).status, 401);
    });

    test("another user's profile is refused", async () => {
        assert.equal((await as(bob.token)(`/api/auth/profile/${alice.id}`)).status, 403);
    });

    test('own profile and admin reads work, without OTP or password', async () => {
        // Leave a pending OTP on the account, as an attacker would trigger
        await api(env.baseUrl, '/api/auth/request-otp', { method: 'POST', body: { phone: '9811100001', mode: 'login' } });
        for (const token of [alice.token, master]) {
            const res = await as(token)(`/api/auth/profile/${alice.id}`);
            assert.equal(res.status, 200);
            assert.equal(res.body.otp, undefined);
            assert.equal(res.body.otpExpiry, undefined);
            assert.equal(res.body.password, undefined);
        }
    });

    test('verify-otp does not echo secrets either', async () => {
        const res = await api(env.baseUrl, '/api/auth/verify-otp', { method: 'POST', body: { phone: '9811100001', otp: '123456' } });
        assert.equal(res.status, 200);
        assert.equal(res.body.user.otp, undefined);
        assert.equal(res.body.user.password, undefined);
        alice.token = res.body.token;
    });
});

describe('profile update', () => {
    test('needs a login and only touches your own account', async () => {
        assert.equal((await api(env.baseUrl, `/api/auth/profile/update/${alice.id}`, { method: 'PATCH', body: { displayName: 'x' } })).status, 401);
        assert.equal((await as(bob.token)(`/api/auth/profile/update/${alice.id}`, 'PATCH', { displayName: 'Hacked' })).status, 403);
    });

    test('a user cannot make themselves an admin', async () => {
        const self = as(alice.token);
        for (const body of [
            { role: 'Admin' },
            { adminRole: 'Master Admin' },
            { adminPermissions: ['Payments'] },
            { status: 'pending' },
            { walletBalance: 99999 },
            { phone: '9811199999' },
            { 'bankVerification.status': 'verified' }
        ]) {
            const res = await self(`/api/auth/profile/update/${alice.id}`, 'PATCH', body);
            assert.equal(res.status, 403, `${JSON.stringify(body)} should be refused`);
        }
        const profile = await self(`/api/auth/profile/${alice.id}`);
        assert.equal(profile.body.role, 'Customer');
        assert.equal(profile.body.adminRole ?? null, null);
    });

    test('sending the profile back unchanged, plus real edits, still works', async () => {
        const self = as(alice.token);
        const current = (await self(`/api/auth/profile/${alice.id}`)).body;
        const res = await self(`/api/auth/profile/update/${alice.id}`, 'PATCH', {
            ...current, phone: `+91 ${current.phone}`, displayName: 'Alice A'
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.displayName, 'Alice A');
        assert.equal(res.body.role, 'Customer');
        assert.equal(res.body.password, undefined);
    });

    test('an admin may set account status but not admin access', async () => {
        assert.equal((await as(master)(`/api/auth/profile/update/${bob.id}`, 'PATCH', { status: 'approved' })).status, 200);
        assert.equal((await as(master)(`/api/auth/profile/update/${bob.id}`, 'PATCH', { role: 'Admin' })).status, 403);
    });
});

describe('other id-based account routes', () => {
    test("cart, documents, image, onboarding and earnings refuse other users' ids", async () => {
        const bobAs = as(bob.token);
        assert.equal((await bobAs(`/api/auth/cart/${alice.id}`)).status, 403);
        assert.equal((await bobAs(`/api/auth/cart/${alice.id}`, 'POST', { cart: {} })).status, 403);
        assert.equal((await bobAs(`/api/auth/become-vendor/${alice.id}`, 'PATCH', {})).status, 403);
        assert.equal((await bobAs(`/api/auth/become-vendor/${alice.id}/submit-services`, 'PATCH', {})).status, 403);
        assert.equal((await bobAs(`/api/auth/become-supplier/${alice.id}`, 'POST', {})).status, 403);
        assert.equal((await bobAs(`/api/auth/update-documents/${alice.id}`, 'PATCH', {})).status, 403);
        assert.equal((await bobAs(`/api/auth/update-profile-image/${alice.id}`, 'PATCH', {})).status, 403);
        assert.equal((await bobAs(`/api/auth/vendor-earnings?vendorId=${vendor.id}`)).status, 403);
        assert.equal((await bobAs(`/api/auth/vendor-payouts/${vendor.id}`)).status, 403);
        assert.equal((await api(env.baseUrl, `/api/auth/cart/${alice.id}`)).status, 401);
    });

    test('your own cart still works', async () => {
        assert.equal((await as(alice.token)(`/api/auth/cart/${alice.id}`)).status, 200);
    });

    test('phone lookup is for vendors and admins only', async () => {
        assert.equal((await api(env.baseUrl, '/api/auth/lookup-phone/9811100002')).status, 401);
        assert.equal((await as(alice.token)('/api/auth/lookup-phone/9811100002')).status, 403);
        assert.notEqual((await as(vendor.token)('/api/auth/lookup-phone/9811100002')).status, 403);
    });

    test("completing a vendor profile only works for your own phone", async () => {
        const res = await as(bob.token)('/api/auth/complete-vendor-profile', 'POST', { phone: '9811100003', shopName: 'Mine now' });
        assert.equal(res.status, 403);
        assert.equal((await api(env.baseUrl, '/api/auth/complete-vendor-profile', { method: 'POST', body: { phone: '9811100003' } })).status, 401);
    });

    test('registering a pre-approved vendor is admin-only', async () => {
        const body = { name: 'V', mobile: '9811100009', email: 'v9@example.com', password: 'secret123' };
        assert.equal((await api(env.baseUrl, '/api/auth/register-vendor', { method: 'POST', body })).status, 401);
        assert.equal((await as(alice.token)('/api/auth/register-vendor', 'POST', body)).status, 403);
        assert.equal((await as(master)('/api/auth/register-vendor', 'POST', body)).status, 201);
    });
});

describe('vendor service approvals', () => {
    const svcId = new mongoose.Types.ObjectId().toString();
    const services = (status, active = true) => ({ shopDetails: { services: [{ id: svcId, name: 'Dry Clean', status, active }] } });
    const stored = async () => (await as(master)(`/api/auth/profile/${vendor.id}`)).body.shopDetails.services.find(s => s.id === svcId);

    test('a vendor cannot approve their own service', async () => {
        const res = await as(vendor.token)(`/api/auth/profile/update/${vendor.id}`, 'PATCH', services('approved'));
        assert.equal(res.status, 403, JSON.stringify(res.body));
        const pending = await as(vendor.token)(`/api/auth/profile/update/${vendor.id}`, 'PATCH', services('pending'));
        assert.equal(pending.status, 200);
        assert.equal((await stored()).status, 'pending');
    });

    test('once an admin approves it, the vendor can toggle it but not change the approval', async () => {
        const approve = await as(master)(`/api/admin/vendors/${vendor.id}/services/${svcId}/status`, 'PATCH', { status: 'approved' });
        assert.equal(approve.status, 200, JSON.stringify(approve.body));

        await as(vendor.token)(`/api/auth/profile/update/${vendor.id}`, 'PATCH', services('pending', false));
        const after = await stored();
        assert.equal(after.status, 'approved');
        assert.equal(after.active, false);
    });
});

describe('removed backdoors', () => {
    test('the hardcoded admin login is gone', async () => {
        const res = await api(env.baseUrl, '/api/auth/admin-login', { method: 'POST', body: { email: 'admin@ezoflife.com', password: 'admin123' } });
        assert.equal(res.status, 404);
    });

    test('9999999994 is no longer turned into an admin on login', async () => {
        const conn = await mongoose.createConnection(env.mongoUri).asPromise();
        await conn.collection('users').insertOne({ phone: '9999999994', role: 'Vendor', status: 'approved', createdAt: new Date(), updatedAt: new Date() });
        await api(env.baseUrl, '/api/auth/request-otp', { method: 'POST', body: { phone: '9999999994', role: 'Admin', mode: 'login' } });
        const after = await conn.collection('users').findOne({ phone: '9999999994' });
        await conn.close();
        assert.equal(after.role, 'Vendor');
    });

    test('seeding endpoints need a master admin', async () => {
        assert.equal((await api(env.baseUrl, '/api/maintenance/seed-accounts')).status, 401);
        assert.equal((await as(alice.token)('/api/maintenance/seed-accounts')).status, 403);
    });
});

describe('production guards', () => {
    let prod;
    before(async () => {
        prod = await startTestEnvironment({ env: { NODE_ENV: 'production', WHATSAPP_ENABLED: 'false' } });
    }, { timeout: 90000 });
    after(async () => { if (prod) await prod.stop(); });

    test('no demo OTP is issued in production', async () => {
        const res = await api(prod.baseUrl, '/api/auth/request-otp', { method: 'POST', body: { phone: '9811100077' } });
        assert.equal(res.status, 503);
    });

    test('seeding endpoints do not exist in production, even for admins', async () => {
        assert.equal((await api(prod.baseUrl, '/api/maintenance/seed-accounts', { token: master })).status, 404);
        assert.equal((await api(prod.baseUrl, '/api/auth/temp-seed', { method: 'POST', token: master })).status, 404);
    });
});
