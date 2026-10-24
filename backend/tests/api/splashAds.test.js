/**
 * Splash ads: admin uploads an image with a display duration and target app;
 * each app gets exactly one live splash from a public endpoint.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let env, admin;

before(async () => {
    env = await startTestEnvironment();
    admin = tokenFor('Admin');
}, { timeout: 90000 });

after(async () => {
    if (!env) return;
    // Delete through the API so the uploaded files are removed from uploads/ads too
    const all = await api(env.baseUrl, '/api/ads/all', { token: admin }).catch(() => ({ body: [] }));
    for (const ad of Array.isArray(all.body) ? all.body : []) {
        await api(env.baseUrl, `/api/ads/${ad._id}`, { method: 'DELETE', token: admin }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 200));
    await env.stop();
});

const upload = async (fields, token = admin) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
    form.append('media', new Blob([PNG], { type: 'image/png' }), 'splash.png');
    const res = await fetch(`${env.baseUrl}/api/ads`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};

const live = (app) => api(env.baseUrl, `/api/ads/active?category=splash&app=${app}`);

describe('splash ads', () => {
    let allApps, vendorOnly;

    test('only admins can upload', async () => {
        assert.equal((await upload({ title: 'x', type: 'image' }, null)).status, 401);
        assert.equal((await upload({ title: 'x', type: 'image' }, tokenFor('Vendor'))).status, 403);
    });

    test('rejects an invalid duration or target app', async () => {
        assert.equal((await upload({ title: 'Too long', type: 'image', category: 'splash', durationSeconds: 45 })).status, 400);
        assert.equal((await upload({ title: 'Zero', type: 'image', category: 'splash', durationSeconds: 0 })).status, 400);
        assert.equal((await upload({ title: 'Bad app', type: 'image', category: 'splash', audience: 'riders' })).status, 400);
    });

    test('no live splash -> 404, so apps skip the splash', async () => {
        assert.equal((await live('customer')).status, 404);
    });

    test('a splash for all apps is served to every app with its duration', async () => {
        const res = await upload({ title: 'Diwali Sale', type: 'image', category: 'splash', durationSeconds: 5, audience: 'all' });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        allApps = res.body;
        assert.equal(allApps.durationSeconds, 5);
        assert.match(allApps.url, /^\/uploads\/ads\/ad-/);

        for (const app of ['customer', 'vendor', 'supplier']) {
            const r = await live(app);
            assert.equal(r.status, 200);
            assert.equal(r.body._id, allApps._id);
        }
        // The uploaded image itself is publicly reachable
        const img = await fetch(`${env.baseUrl}${allApps.url}`);
        assert.equal(img.status, 200);
    });

    test('a vendor-only splash takes over the vendor app and pauses the overlapping one', async () => {
        const res = await upload({ title: 'Vendor Supplies Week', type: 'image', category: 'splash', durationSeconds: 3, audience: 'vendor' });
        assert.equal(res.status, 201);
        vendorOnly = res.body;

        assert.equal((await live('vendor')).body._id, vendorOnly._id);
        // "All apps" overlapped the vendor app, so it was paused: customers now see nothing
        assert.equal((await live('customer')).status, 404);

        const all = await api(env.baseUrl, '/api/ads/all', { token: admin });
        const liveSplashes = all.body.filter(a => a.category === 'splash' && a.isActive);
        assert.deepEqual(liveSplashes.map(a => a._id), [vendorOnly._id]);
    });

    test('re-activating a splash makes it the only live one again', async () => {
        const res = await api(env.baseUrl, `/api/ads/${allApps._id}/toggle`, { method: 'PATCH', token: admin });
        assert.equal(res.status, 200);
        assert.equal(res.body.isActive, true);
        assert.equal((await live('vendor')).body._id, allApps._id);
        assert.equal((await live('customer')).body._id, allApps._id);
    });

    test('admin can change duration and target app without re-uploading', async () => {
        const res = await api(env.baseUrl, `/api/ads/${allApps._id}`, {
            method: 'PATCH', token: admin, body: { durationSeconds: 8, audience: 'customer' }
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.durationSeconds, 8);
        assert.equal((await live('customer')).body.durationSeconds, 8);
        assert.equal((await live('vendor')).status, 404);

        const bad = await api(env.baseUrl, `/api/ads/${allApps._id}`, { method: 'PATCH', token: admin, body: { durationSeconds: 100 } });
        assert.equal(bad.status, 400);
        const notAdmin = await api(env.baseUrl, `/api/ads/${allApps._id}`, { method: 'PATCH', token: tokenFor('Vendor'), body: { durationSeconds: 2 } });
        assert.equal(notAdmin.status, 403);
    });

    test('rejects an unknown app name', async () => {
        assert.equal((await live('riders')).status, 400);
    });

    test('deleting a splash removes it and its image', async () => {
        const res = await api(env.baseUrl, `/api/ads/${allApps._id}`, { method: 'DELETE', token: admin });
        assert.equal(res.status, 200);
        assert.equal((await live('customer')).status, 404);
        await new Promise(r => setTimeout(r, 200));
        assert.equal((await fetch(`${env.baseUrl}${allApps.url}`)).status, 404);
    });

    test('home banners are unaffected by splash rules', async () => {
        const res = await upload({ title: 'Banner', type: 'image', category: 'home_banner' });
        assert.equal(res.status, 201);
        const banner = await api(env.baseUrl, '/api/ads/active?category=home_banner');
        assert.equal(banner.body._id, res.body._id);
    });
});
