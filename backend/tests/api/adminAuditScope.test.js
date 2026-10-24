import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import ServiceArea from '../../src/models/ServiceArea.js';
import SupplierApplication from '../../src/models/SupplierApplication.js';
import SystemConfig from '../../src/models/SystemConfig.js';
import AdminAuditEvent from '../../src/models/AdminAuditEvent.js';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';
let env, admin, scoped, readonly, inside, outside, vendor, applicant;
const call = (path, actor = admin, method = 'GET', body) => api(env.baseUrl, `/api/admin${path}`, { token: actor && tokenFor(actor.role, String(actor._id)), method, body });
before(async () => {
    env = await startTestEnvironment({ env: { SHIPROCKET_ENABLED: 'false', WHATSAPP_ENABLED: 'false' } }); await mongoose.connect(env.mongoUri);
    [admin, scoped, readonly, inside, outside, vendor, applicant] = await User.create([
        { role: 'Admin' }, { role: 'Admin', geofenceRestrictions: ['Allowed'] }, { role: 'Admin', adminAccessType: 'Read-Only' },
        { role: 'Customer', addresses: [{ address: 'Test default address', isDefault: true, location: { lat: 0, lng: 0 } }] },
        { role: 'Vendor', location: { lat: 5, lng: 5 } }, { role: 'Vendor' }, { role: 'Customer', onboardingStage: 'INITIAL_REVIEW', status: 'pending' }
    ].map((value, index) => ({ phone: `996600000${index}`, status: 'approved', displayName: `Account ${index}`, location: { lat: 0, lng: 0 }, ...value })));
    await ServiceArea.create({ areaName: 'Allowed', isActive: true, boundary: { type: 'Polygon', coordinates: [[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]] } });
}, { timeout: 90000 });
after(async () => { await mongoose.disconnect(); if (env) await env.stop(); });

test('audit history requires an active admin and permits read-only inspection', async () => {
    assert.equal((await call('/audit-events', null)).status, 401);
    assert.equal((await call('/audit-events', inside)).status, 403);
    assert.equal((await call('/audit-events', readonly)).status, 200);
});

test('account lists and detail enforce scope, including valid zero coordinates', async () => {
    for (const path of ['/users', '/vendors', '/customers']) {
        const res = await call(path, scoped);
        assert.equal(res.status, 200);
        assert.ok(!res.body.some(value => value._id === String(outside._id)));
    }
    assert.equal((await call(`/vendors/${vendor._id}`, scoped)).status, 200);
    assert.equal((await call(`/vendor-request/${outside._id}`, scoped)).status, 403);
    assert.equal((await call(`/vendors/${outside._id}`, admin)).status, 200);
});

test('out-of-scope block, approval, service update and deletion cannot change storage', async () => {
    const original = JSON.stringify(await User.findById(outside._id).lean());
    for (const [path, method, body] of [
        [`/users/${outside._id}/toggle-status`, 'PATCH'], [`/approve-vendor/${outside._id}`, 'POST'],
        [`/reject-vendor/${outside._id}`, 'POST', { reason: 'No' }], [`/vendors/${outside._id}`, 'DELETE'],
        [`/vendors/${outside._id}/services/${new mongoose.Types.ObjectId()}/status`, 'PATCH', { status: 'approved' }]
    ]) assert.equal((await call(path, scoped, method, body)).status, 403);
    assert.equal(JSON.stringify(await User.findById(outside._id).lean()), original);
});

test('scoped global mutations are denied before configuration or bulk data changes', async () => {
    const users = await User.countDocuments(); const configs = await SystemConfig.countDocuments();
    for (const [path, method, body] of [
        ['/config', 'POST', { key: 'secret', value: 'not saved' }], ['/users-clear-all', 'DELETE'],
        ['/orders-clear-all', 'POST'], ['/services-clear-all', 'DELETE'], ['/force-clear-orders', 'POST'],
        ['/invite-sub-admin', 'POST', { phone: '123' }], ['/record-vendor-payout', 'POST', { vendorId: vendor._id, amount: 1 }]
    ]) assert.equal((await call(path, scoped, method, body)).status, 403);
    assert.equal(await User.countDocuments(), users); assert.equal(await SystemConfig.countDocuments(), configs);
});

test('block/unblock events preserve safe state changes and blocked vendors remain discoverable', async () => {
    assert.equal((await call(`/users/${vendor._id}/toggle-status`, scoped, 'PATCH')).status, 200);
    const list = await call('/users', scoped);
    assert.ok(list.body.some(value => value._id === String(vendor._id) && value.isBlocked));
    const events = await call(`/audit-events?targetId=${vendor._id}&outcome=Succeeded`, scoped);
    const event = events.body.data.find(value => value.path.endsWith('toggle-status'));
    assert.equal(event.before.status, 'approved'); assert.equal(event.after.status, 'rejected'); assert.equal(event.after.isBlocked, true);
    assert.equal((await call(`/users/${vendor._id}/toggle-status`, scoped, 'PATCH')).status, 200);
    assert.equal((await User.findById(vendor._id)).isBlocked, false);
});

test('read-only attempts are denied and correlated with a persisted intent', async () => {
    assert.equal((await call(`/users/${inside._id}/toggle-status`, readonly, 'PATCH')).status, 403);
    const events = await call(`/audit-events?actorId=${readonly._id}`);
    const denied = events.body.data.find(event => event.outcome === 'Denied');
    assert.ok(denied); assert.equal(denied.statusCode, 403);
    assert.ok(events.body.data.some(event => event.operationId === denied.operationId && event.outcome === 'Requested'));
    assert.equal((await User.findById(inside._id)).status, 'approved');
});

test('audit queries paginate and scoped admins can only inspect their own events', async () => {
    const all = await call('/audit-events?limit=2');
    assert.equal(all.status, 200); assert.equal(all.body.data.length, 2); assert.ok(all.body.pagination.total > 2);
    const combined = await call('/audit-events?outcome=' + encodeURIComponent(JSON.stringify(['Denied', 'Succeeded'])));
    assert.equal(combined.status, 200); assert.ok(combined.body.data.every(event => ['Denied', 'Succeeded'].includes(event.outcome)));
    const own = await call('/audit-events', scoped);
    assert.equal(own.body.visibility, 'own'); assert.ok(own.body.data.every(event => event.actorId === String(scoped._id)));
    assert.equal((await call(`/audit-events?actorId=${admin._id}`, scoped)).status, 403);
    assert.equal((await call('/audit-events?search=toggle-status&outcome=Denied', scoped)).body.data.every(event => event.outcome === 'Denied' && event.path.endsWith('toggle-status')), true);
    for (const query of ['limit=101', 'page=0', 'page=99999999999999999', 'outcome=bad', 'actorId=bad', 'from=bad', 'from=2026-02-01&to=2026-01-01']) assert.equal((await call(`/audit-events?${query}`)).status, 400);
});

test('audit logs omit credentials, document data, configuration values and query secrets', async () => {
    const secret = 'UNIQUE_SECRET_DO_NOT_LOG';
    assert.equal((await call(`/config?token=${secret}`, admin, 'POST', { key: 'audit_test', value: secret, password: secret, otp: secret, documents: [{ url: secret }] })).status, 200);
    const events = await AdminAuditEvent.find().lean();
    assert.ok(!JSON.stringify(events).includes(secret));
    assert.ok(events.some(event => event.path === '/api/admin/config' && event.outcome === 'Succeeded'));
});

test('public config and diagnostic GETs are read-only while retaining defaults and reporting issues', async () => {
    const count = await SystemConfig.countDocuments();
    const config = await call('/config', null);
    assert.equal(config.status, 200); assert.ok(config.body.some(item => item.key === 'invoice_settings'));
    assert.equal(await SystemConfig.countDocuments(), count);
    const bad = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id: bad, phone: '9966000098', role: 'User' });
    const res = await call('/diagnostic', readonly);
    assert.equal(res.status, 200); assert.equal(res.body.fixedInvalidRoles, 0); assert.equal(res.body.invalidRoles, 1);
    assert.equal((await User.collection.findOne({ _id: bad })).role, 'User');
});

test('supplier profile editing cannot grant roles or admin privileges', async () => {
    const supplier = await User.create({ phone: '9966000097', role: 'Supplier', status: 'approved', location: { lat: 0, lng: 0 } });
    assert.equal((await call(`/suppliers/${supplier._id}`, scoped, 'PATCH', { role: 'Admin', adminAccessType: 'Read/Write' })).status, 400);
    assert.equal((await User.findById(supplier._id)).role, 'Supplier');
    assert.equal((await call(`/suppliers/${supplier._id}`, scoped, 'PATCH', { displayName: 'Updated supplier', supplierDetails: { businessName: 'Shop' } })).status, 200);
});

test('vendor onboarding and application warehouse scope retain authorized actions', async () => {
    assert.equal((await call(`/vendor-request/${applicant._id}/approve-initial`, scoped, 'PATCH')).status, 200);
    assert.equal((await User.findById(applicant._id)).onboardingStage, 'SERVICE_SELECTION');
    const application = await SupplierApplication.create({
        user: outside._id, warehouseLocation: { lat: 0, lng: 0 }, status: 'Pending',
        registeredBusinessName: 'Test Supplier', contactPersonName: 'Test Contact', designation: 'Owner', entityType: 'Supplier',
        panNumber: 'TESTPAN', panDoc: 'test', gstNumber: 'TESTGST', gstDoc: 'test', warehouseAddress: 'Test warehouse',
        bankName: 'Test Bank', accountNumber: '000000000', ifscCode: 'TEST0000', cancelledChequeDoc: 'test', priceListDoc: 'test'
    });
    const id = application._id;
    assert.equal((await call(`/suppliers/${id}/reject`, scoped, 'PATCH', { reason: 'Revision' })).status, 200);
    assert.equal((await SupplierApplication.findById(id)).status, 'Rejected');
    await SupplierApplication.collection.updateOne({ _id: id }, { $set: { warehouseLocation: { lat: 5, lng: 5 } } });
    assert.equal((await call(`/suppliers/${id}/reject`, scoped, 'PATCH', { reason: 'No' })).status, 403);
});

test('audit events survive account deletion and reject model-level modification/deletion', async () => {
    const account = await User.create({ phone: '9966000096', role: 'Customer', status: 'approved', location: { lat: 0, lng: 0 } });
    assert.equal((await call(`/users/${account._id}`, scoped, 'DELETE')).status, 200);
    const event = await AdminAuditEvent.findOne({ targetId: String(account._id), outcome: 'Succeeded' });
    assert.ok(event); assert.equal(event.after.exists, false);
    await assert.rejects(AdminAuditEvent.updateOne({ _id: event._id }, { $set: { outcome: 'Failed' } }), /append-only/);
    await assert.rejects(AdminAuditEvent.deleteOne({ _id: event._id }), /append-only/);
    await assert.rejects(AdminAuditEvent.bulkWrite([{ deleteOne: { filter: { _id: event._id } } }]), /append-only/);
    assert.ok(await AdminAuditEvent.exists({ _id: event._id }));
});


test('vendor and supplier operations cannot delete or convert admin accounts', async () => {
    const before = JSON.stringify(await User.findById(readonly._id).lean());
    assert.equal((await call(`/vendors/${readonly._id}`, admin, 'DELETE')).status, 403);
    assert.equal((await call(`/suppliers/${readonly._id}/approve`, admin, 'PATCH')).status, 403);
    assert.equal(JSON.stringify(await User.findById(readonly._id).lean()), before);
});
