/**
 * Sub-admin invitations: a master admin invites someone to a role, an email
 * with a one-use link goes out, and the invitee can only log in (phone + OTP)
 * after accepting it. Resend replaces the link.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';
import mongoose from 'mongoose';

const outboxDir = mkdtempSync(join(tmpdir(), 'ezoflife-outbox-'));
const OUTBOX = join(outboxDir, 'mail.jsonl');

let env, master, supportToken;

before(async () => {
    env = await startTestEnvironment({ env: { EMAIL_OUTBOX_FILE: OUTBOX, FRONTEND_URL: 'https://admin.example.com' } });
    master = tokenFor('Admin');
}, { timeout: 90000 });

after(async () => {
    if (env) await env.stop();
    rmSync(outboxDir, { recursive: true, force: true });
});

const mails = () => existsSync(OUTBOX)
    ? readFileSync(OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
    : [];

const lastMailTo = (email) => mails().filter(m => m.to === email).at(-1);
const tokenFromMail = (mail) => mail.text.match(/accept-invite\?token=([a-f0-9]{64})/)[1];

const invite = (body, token = master) =>
    api(env.baseUrl, '/api/admin/invite-sub-admin', { method: 'POST', token, body });

const baseInvite = {
    firstName: 'Riya', lastName: 'Shah', email: 'riya@example.com', phone: '9876500001',
    role: 'Customer Support Executive', accessType: 'Read/Write', geofences: ['Indore']
};

describe('admin invitations', () => {
    let riyaId, firstToken;

    test('validates the form', async () => {
        assert.equal((await invite({ ...baseInvite, email: 'not-an-email' })).status, 400);
        assert.equal((await invite({ ...baseInvite, phone: '123' })).status, 400);
        assert.equal((await invite({ ...baseInvite, role: 'Wizard' })).status, 400);
        assert.equal((await invite({ ...baseInvite, role: 'Custom', permissions: ['Nope'] })).status, 400);
    });

    test('creates a pending invite and emails a link naming the role', async () => {
        const res = await invite(baseInvite);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.emailSent, true);
        assert.equal(res.body.admin.inviteStatus, 'Invite Pending');
        assert.deepEqual(res.body.admin.adminPermissions, ['User Management', 'Orders', 'Support Tickets', 'FAQ Manager']);
        assert.doesNotMatch(JSON.stringify(res.body), /token=/, 'the invite link must only go to the invitee');
        riyaId = res.body.admin._id;

        const mail = lastMailTo('riya@example.com');
        assert.match(mail.subject, /Customer Support Executive/);
        assert.match(mail.text, /join the Spinzyt admin panel as Customer Support Executive/);
        assert.match(mail.text, /^[\s\S]*https:\/\/admin\.example\.com\/admin\/accept-invite\?token=/);
        firstToken = tokenFromMail(mail);
    });

    test('rejects a duplicate phone or email', async () => {
        assert.equal((await invite(baseInvite)).status, 400);
    });

    test('the pending invitee cannot log in', async () => {
        const req = await api(env.baseUrl, '/api/auth/request-otp', { method: 'POST', body: { phone: '9876500001', role: 'Admin', mode: 'login' } });
        assert.equal(req.status, 403);
        assert.match(req.body.message, /accept the invitation/i);
        const ver = await api(env.baseUrl, '/api/auth/verify-otp', { method: 'POST', body: { phone: '9876500001', otp: '123456' } });
        assert.notEqual(ver.status, 200);
    });

    test('the directory shows the invite as pending', async () => {
        const res = await api(env.baseUrl, '/api/admin/sub-admins', { token: master });
        assert.equal(res.status, 200);
        const row = res.body.find(a => a._id === riyaId);
        assert.equal(row.inviteStatus, 'Invite Pending');
        assert.equal(row.inviteSendCount, 1);
        assert.equal(row.inviteTokenHash, undefined);
    });

    test('resend issues a new link and retires the old one', async () => {
        const res = await api(env.baseUrl, `/api/admin/sub-admins/${riyaId}/resend-invite`, { method: 'POST', token: master });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.admin.inviteSendCount, 2);

        const newToken = tokenFromMail(lastMailTo('riya@example.com'));
        assert.notEqual(newToken, firstToken);
        assert.equal((await api(env.baseUrl, `/api/auth/admin-invite?token=${firstToken}`)).status, 404);

        const details = await api(env.baseUrl, `/api/auth/admin-invite?token=${newToken}`);
        assert.equal(details.status, 200);
        assert.equal(details.body.adminRole, 'Customer Support Executive');
        firstToken = newToken;
    });

    test('accepting activates the account; the link cannot be used again', async () => {
        const res = await api(env.baseUrl, '/api/auth/admin-invite/accept', { method: 'POST', body: { token: firstToken } });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal((await api(env.baseUrl, '/api/auth/admin-invite/accept', { method: 'POST', body: { token: firstToken } })).status, 410);
        assert.equal((await api(env.baseUrl, `/api/auth/admin-invite?token=${firstToken}`)).status, 410);

        const list = await api(env.baseUrl, '/api/admin/sub-admins', { token: master });
        assert.equal(list.body.find(a => a._id === riyaId).inviteStatus, 'Accepted');

        const resend = await api(env.baseUrl, `/api/admin/sub-admins/${riyaId}/resend-invite`, { method: 'POST', token: master });
        assert.equal(resend.status, 400);
    });

    test('after accepting, the invitee logs in with phone + OTP and gets their permissions', async () => {
        const req = await api(env.baseUrl, '/api/auth/request-otp', { method: 'POST', body: { phone: '9876500001', role: 'Admin', mode: 'login' } });
        assert.equal(req.status, 200, JSON.stringify(req.body));
        const ver = await api(env.baseUrl, '/api/auth/verify-otp', { method: 'POST', body: { phone: '9876500001', otp: '123456' } });
        assert.equal(ver.status, 200);
        assert.equal(ver.body.user.role, 'Admin');
        assert.equal(ver.body.user.adminRole, 'Customer Support Executive');
        assert.equal(ver.body.user.inviteTokenHash, undefined);

        // A non-master admin cannot manage admins
        const sub = ver.body.token;
        supportToken = sub;
        assert.equal((await api(env.baseUrl, '/api/admin/sub-admins', { token: sub })).status, 403);
        assert.equal((await invite({ ...baseInvite, email: 'x@example.com', phone: '9876500009' }, sub)).status, 403);
    });

    test('Global Auditor is always read-only', async () => {
        const res = await invite({ ...baseInvite, email: 'audit@example.com', phone: '9876500002', role: 'Global Auditor / Developer', accessType: 'Read/Write' });
        assert.equal(res.status, 201);
        assert.equal(res.body.admin.adminAccessType, 'Read-Only');
    });

    test('rejects malformed or unknown invite tokens', async () => {
        assert.equal((await api(env.baseUrl, '/api/auth/admin-invite?token=abc')).status, 404);
        assert.equal((await api(env.baseUrl, '/api/auth/admin-invite/accept', { method: 'POST', body: { token: 'f'.repeat(64) } })).status, 404);
    });

    test('only admins reach the invite endpoints', async () => {
        assert.equal((await invite(baseInvite, null)).status, 401);
        assert.equal((await invite(baseInvite, tokenFor('Vendor'))).status, 403);
    });
});

describe('module permissions on the API', () => {
    const call = (path, method = 'GET', body) => api(env.baseUrl, path, { method, token: supportToken, body });

    test('a sub-admin reaches the modules their role grants', async () => {
        // Customer Support Executive: User Management, Orders, Support Tickets, FAQ Manager
        assert.equal((await call('/api/orders/all')).status, 200);
        assert.equal((await call('/api/tickets/admin/all')).status, 200);
        assert.equal((await call('/api/admin/users')).status, 200);
        assert.equal((await call('/api/faqs/admin/all')).status, 200);
    });

    test('and is refused everywhere else', async () => {
        for (const [path, method] of [
            ['/api/admin/stats', 'GET'],
            ['/api/admin/dashboard-analytics', 'GET'],
            ['/api/admin/customer-payments', 'GET'],
            ['/api/admin/pending-approvals', 'GET'],
            ['/api/ads/all', 'GET'],
            ['/api/partnerships/all', 'GET'],
            ['/api/categories', 'POST'],
            ['/api/legal/privacy-policy', 'POST'],
            ['/api/admin/config', 'POST'],
            ['/api/admin/force-clear-orders', 'POST']
        ]) {
            const res = await call(path, method, method === 'GET' ? undefined : {});
            assert.equal(res.status, 403, `${method} ${path} should be refused, got ${res.status}`);
        }
    });

    test('shared lookups stay open to every admin', async () => {
        assert.equal((await call('/api/geofence/areas')).status, 200);
        assert.equal((await call('/api/admin/sidebar-counts')).status, 200);
        assert.equal((await call('/api/categories')).status, 200);
    });

    test('full-access roles and the master admin are not limited', async () => {
        assert.equal((await api(env.baseUrl, '/api/admin/stats', { token: master })).status, 200);
    });
});

describe('invite links and older invites', () => {
    test('the link points at the admin site the invite was sent from', async () => {
        const res = await fetch(`${env.baseUrl}/api/admin/invite-sub-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${master}`, Origin: 'http://localhost:5174' },
            body: JSON.stringify({ ...baseInvite, email: 'origin@example.com', phone: '9876500003' })
        });
        assert.equal(res.status, 201);
        assert.match(lastMailTo('origin@example.com').text, /http:\/\/localhost:5174\/admin\/accept-invite\?token=/);
    });

    test('without an Origin (e.g. a script) the link falls back to FRONTEND_URL', async () => {
        // Unknown browser origins never get this far: CORS rejects them first.
        const res = await invite({ ...baseInvite, email: 'noorigin@example.com', phone: '9876500004' });
        assert.equal(res.status, 201);
        assert.match(lastMailTo('noorigin@example.com').text, /https:\/\/admin\.example\.com\/admin\/accept-invite/);
    });

    test('a pending invite from the old flow is flagged and can be resent', async () => {
        const conn = await mongoose.createConnection(env.mongoUri).asPromise();
        const { insertedId } = await conn.collection('users').insertOne({
            phone: '9876500005', email: 'legacy@example.com', role: 'Admin', status: 'pending',
            displayName: 'Old Invite', adminRole: 'HR', adminPermissions: ['Career Center'],
            activationToken: 'oldtoken123', createdAt: new Date(), updatedAt: new Date()
        });
        await conn.close();

        const list = await api(env.baseUrl, '/api/admin/sub-admins', { token: master });
        const row = list.body.find(a => a._id === String(insertedId));
        assert.equal(row.inviteStatus, 'Invite Pending');
        assert.equal(row.needsResend, true);

        const resend = await api(env.baseUrl, `/api/admin/sub-admins/${insertedId}/resend-invite`, { method: 'POST', token: master });
        assert.equal(resend.status, 200);
        assert.equal(resend.body.admin.needsResend, false);
        assert.match(lastMailTo('legacy@example.com').subject, /as HR/);
    });
});
