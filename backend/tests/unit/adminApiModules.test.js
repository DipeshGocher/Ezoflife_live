import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { modulesForApi, MASTER } from '../../src/config/adminApiModules.js';
import { ADMIN_MODULES } from '../../src/config/adminAccess.js';
import { buildRouteManifest } from '../helpers/routeManifest.js';

/** Admin-only routes that every admin may call (shared lookups). */
const SHARED_ADMIN_ROUTES = new Set([
    'GET /api/admin/sidebar-counts',
    'GET /api/geofence/areas'
]);

describe('admin API module map', () => {
    test('every admin-only route belongs to a module unless it is a known shared lookup', () => {
        const unmapped = buildRouteManifest()
            .filter(e => e.guarded)
            .map(e => `${e.method} ${e.path}`)
            .filter(key => {
                const [method, path] = key.split(' ');
                return !modulesForApi(method, path.replace(/:[A-Za-z]+/g, 'x1'));
            })
            .filter(key => !SHARED_ADMIN_ROUTES.has(key));
        assert.deepEqual(unmapped, [], 'add these routes to src/config/adminApiModules.js (or to SHARED_ADMIN_ROUTES if every admin needs them)');
    });

    test('rules only name real modules', () => {
        for (const e of buildRouteManifest()) {
            const m = modulesForApi(e.method, e.path.replace(/:[A-Za-z]+/g, 'x1'));
            if (!m || m === MASTER) continue;
            for (const name of m) assert.ok(ADMIN_MODULES.includes(name), `${name} is not an admin module`);
        }
    });

    test('maps representative calls', () => {
        assert.equal(modulesForApi('POST', '/api/admin/invite-sub-admin'), MASTER);
        assert.equal(modulesForApi('POST', '/api/admin/force-clear-orders'), MASTER);
        assert.deepEqual(modulesForApi('GET', '/api/admin/stats'), ['Dashboard']);
        assert.deepEqual(modulesForApi('PATCH', '/api/admin/suppliers/abc/approve'), ['Registration Approval']);
        assert.deepEqual(modulesForApi('PATCH', '/api/admin/suppliers/abc'), ['User Management']);
        assert.deepEqual(modulesForApi('GET', '/api/admin/suppliers'), ['User Management', 'Vendor Supply Pricing']);
        assert.deepEqual(modulesForApi('PATCH', '/api/orders/status/abc'), ['Orders']);
        assert.deepEqual(modulesForApi('POST', '/api/legal/privacy-policy'), ['Privacy Policy']);
        assert.deepEqual(modulesForApi('GET', '/api/admin/customer-payments?x=1'), ['Payments']);
        // shared reads
        assert.equal(modulesForApi('GET', '/api/geofence/areas'), null);
        assert.equal(modulesForApi('GET', '/api/categories'), null);
        assert.equal(modulesForApi('GET', '/api/admin/config'), null);
    });
});
