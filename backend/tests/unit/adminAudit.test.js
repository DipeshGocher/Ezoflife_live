import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import AdminAuditEvent from '../../src/models/AdminAuditEvent.js';
import ServiceArea from '../../src/models/ServiceArea.js';
import { beginAdminAudit, auditAccountSnapshot } from '../../src/middleware/adminAudit.js';
import { filterAccountsByScope } from '../../src/utils/adminScope.js';

const response = () => {
    const res = new EventEmitter();
    res.headers = {}; res.statusCode = 200;
    res.setHeader = (key, value) => { res.headers[key] = value; };
    res.done = new Promise(resolve => { res.json = body => { res.body = body; resolve(); return res; }; });
    return res;
};
const request = () => ({ method: 'POST', originalUrl: '/api/admin/config?token=never-log', admin: { id: '6a7d56c980a151d5ad8b17d0' }, account: { role: 'Admin' }, body: { password: 'secret', value: 'private' } });

test('audit snapshots retain account state and exclude private fields', () => {
    assert.deepEqual(auditAccountSnapshot({ role: 'Vendor', status: 'approved', phone: 'private', password: 'secret', bankDetails: { accountNumber: 'private' } }), { role: 'Vendor', status: 'approved' });
    assert.deepEqual(auditAccountSnapshot(null), { exists: false });
});
test('audit intent persistence failure rejects before installing an operation', async t => {
    t.mock.method(AdminAuditEvent, 'create', async () => { throw new Error('Storage offline'); });
    const req = request(); const res = response();
    await assert.rejects(beginAdminAudit(req, res), /Storage offline/);
    assert.equal(req.auditOperation, undefined);
});
test('completion persistence failure preserves the business response and durable intent', async t => {
    const stored = [];
    t.mock.method(AdminAuditEvent, 'create', async event => { if (stored.length) throw new Error('Offline'); stored.push(event); });
    t.mock.method(console, 'error', () => {});
    const req = request(); const res = response();
    await beginAdminAudit(req, res); res.json({ saved: true }); await res.done;
    assert.deepEqual(res.body, { saved: true });
    assert.equal(res.statusCode, 200); assert.equal(res.headers['X-Audit-Status'], 'pending');
    assert.equal(stored[0].outcome, 'Requested'); assert.equal(stored[0].path, '/api/admin/config');
    assert.ok(!JSON.stringify(stored).includes('secret'));
});
test('duplicate shared guards create only one correlated audit pair', async t => {
    const stored = []; t.mock.method(AdminAuditEvent, 'create', async event => { stored.push(event); });
    const req = request(); const res = response();
    await beginAdminAudit(req, res); await beginAdminAudit(req, res);
    res.statusCode = 403; res.json({ message: 'Denied' }); await res.done;
    assert.equal(stored.length, 2); assert.equal(stored[1].outcome, 'Denied');
    assert.equal(stored[0].operationId, stored[1].operationId);
});
test('service-area lookup failure propagates instead of returning an unfiltered user list', async t => {
    t.mock.method(ServiceArea, 'find', () => ({ lean: () => ({ exec: () => Promise.reject(new Error('Scope storage offline')) }) }));
    await assert.rejects(filterAccountsByScope({ account: { geofenceRestrictions: ['Allowed'] } }, [{ role: 'Customer', location: { lat: 0, lng: 0 } }]), /Scope storage offline/);
});
