import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Order from '../../src/models/Order.js';
import Ticket from '../../src/models/Ticket.js';
import B2BOrder from '../../src/models/B2BOrder.js';
import ServiceArea from '../../src/models/ServiceArea.js';
import Feedback from '../../src/models/Feedback.js';
import Payout from '../../src/models/Payout.js';
import VendorMasterSupply from '../../src/models/VendorMasterSupply.js';
import Job from '../../src/models/Job.js';
import JobApplication from '../../src/models/JobApplication.js';
import MasterService from '../../src/models/MasterService.js';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';
let env, admin, scoped, readonly, customer, outsideCustomer, vendor, outsideVendor, supplier, unknown, insideOrder, outsideOrder;
const call = (path, actor = scoped) => api(env.baseUrl, path, { token: actor && tokenFor(actor.role, String(actor._id)) });
const analyticsPath = '/api/admin/dashboard-analytics?timeRange=Custom%20Range&startDate=2000-01-01&endDate=2100-01-01';
before(async () => {
    env = await startTestEnvironment({ env: { SHIPROCKET_ENABLED: 'false', WHATSAPP_ENABLED: 'false' } }); await mongoose.connect(env.mongoUri);
    [admin, scoped, readonly, customer, outsideCustomer, vendor, outsideVendor, supplier, unknown] = await User.create([
        { role: 'Admin' }, { role: 'Admin', geofenceRestrictions: ['Allowed'] }, { role: 'Admin', adminAccessType: 'Read-Only', geofenceRestrictions: ['Allowed'] },
        { role: 'Customer', displayName: 'Visible customer', addresses: [{ address: 'Allowed', city: 'Allowed City', state: 'Allowed State', pincode: '111111', location: { lat: 1, lng: 1 }, isDefault: true }] },
        { role: 'Customer', displayName: 'Hidden customer', location: { lat: 5, lng: 5 }, addresses: [{ address: 'Outside', city: 'Secret City', state: 'Secret State', pincode: '222222', location: { lat: 5, lng: 5 } }] },
        { role: 'Vendor', shopDetails: { name: 'Visible vendor' } }, { role: 'Vendor', location: { lat: 5, lng: 5 }, shopDetails: { name: 'Hidden vendor' } },
        { role: 'Supplier' }, { role: 'Customer', location: { lat: 0, lng: 0 } }
    ].map((value, index) => ({ phone: `994400000${index}`, displayName: `Report actor ${index}`, role: 'Customer', status: 'approved', location: { lat: 1, lng: 1 }, ...value })));
    await ServiceArea.create([
        { areaName: 'Allowed', city: 'Allowed City', pincodes: ['111111', '333333'], isActive: true, boundary: { type: 'Polygon', coordinates: [[[0.5,0.5],[2,0.5],[2,2],[0.5,2],[0.5,0.5]]] } },
        { areaName: 'Forbidden', city: 'Secret City', pincodes: ['222222', '333333'], isActive: true, boundary: { type: 'Polygon', coordinates: [[[4,4],[6,4],[6,6],[4,6],[4,4]]] } }
    ]);
    const base = { customer: customer._id, vendor: vendor._id, status: 'PROCESSING', pickupAddress: 'Pickup', dropAddress: 'Drop', pickupLocation: { lat: 1, lng: 1 }, totalAmount: 100, advanceAmount: 5, dueAmount: 95, items: [{ serviceId: 'test', name: 'Service', quantity: 1, price: 100 }] };
    [insideOrder, outsideOrder] = await Order.create([
        base, { ...base, customer: outsideCustomer._id, vendor: outsideVendor._id, pickupLocation: { lat: 5, lng: 5 }, totalAmount: 10000 },
        { ...base, pickupLocation: { lat: 5, lng: 5 }, totalAmount: 20000 },
        { ...base, customer: null, customerSnapshot: { displayName: 'Archived allowed', phone: '1000000000', isExUser: true }, totalAmount: 500 },
        { ...base, orderType: 'Walk-In', pickupLocation: { lat: 5, lng: 5 }, totalAmount: 50 },
        { ...base, orderType: 'Walk-In', vendor: outsideVendor._id, totalAmount: 50000 },
        { ...base, customer: outsideCustomer._id, totalAmount: 17 }
    ]);
    await Ticket.create([
        { customer: customer._id, order: insideOrder._id, subject: 'Allowed assistance', description: 'Help', status: 'Open' },
        { customer: customer._id, order: insideOrder._id, subject: 'Allowed dispute', description: 'Help', category: 'Missing Items', status: 'Open' },
        { customer: outsideCustomer._id, order: outsideOrder._id, subject: 'Secret assistance', description: 'Private', status: 'Open' },
        { customer: unknown._id, subject: 'Unknown assistance', description: 'Unknown' }
    ]);
    await Feedback.create([
        { user: customer._id, order: insideOrder._id, vendor: vendor._id, rating: 5, comment: 'Allowed feedback' },
        { user: outsideCustomer._id, order: outsideOrder._id, vendor: outsideVendor._id, rating: 1, comment: 'Secret feedback' }
    ]);
    await B2BOrder.create(['111111', '222222', '333333', '-'].map((pincode, index) => ({ vendor: vendor._id, supplier: supplier._id, cycleId: `cycle-${index}`, deliveryDay: 'Sunday', deliveryDate: new Date(), pincode, totalAmount: [200,10000,20000,30000][index], items: [] })));
    await Payout.create({ vendor: vendor._id, amount: 75, transactionId: 'TEST-PAYOUT-001', status: 'Completed' });
}, { timeout: 90000 });
after(async () => { await mongoose.disconnect(); if (env) await env.stop(); });

test('dashboard statistics scope order, account, ticket and monthly revenue inputs', async () => {
    const res = await call('/api/admin/stats'); assert.equal(res.status, 200);
    assert.equal(res.body.scope.type, 'assigned_service_areas');
    assert.equal(res.body.stats.totalOrders, 4); assert.equal(res.body.stats.totalRevenue, 667);
    assert.equal(res.body.stats.pendingIssues, 2); assert.equal(res.body.stats.totalUsers, 1);
    assert.equal(res.body.stats.revenueTrend.reduce((sum, entry) => sum + entry.revenue, 0), 667);
    assert.equal((await call('/api/admin/stats', readonly)).body.stats.totalOrders, 4);
    assert.equal((await call('/api/admin/stats', admin)).body.stats.totalOrders, 7);
});

test('analytics keep main totals, trends, B2B postcode scope and leaderboards within permissions', async () => {
    const res = await call(analyticsPath); assert.equal(res.status, 200);
    assert.equal(res.body.scope.type, 'assigned_service_areas');
    const encoded = JSON.stringify(res.body);
    assert.ok(!encoded.includes('Hidden vendor')); assert.ok(!encoded.includes('Secret feedback'));
    assert.equal(res.body.data.financials.grossRevenue, 867);
    const all = await call(analyticsPath, admin); assert.equal(all.status, 200);
    assert.ok(all.body.data.financials.grossRevenue > res.body.data.financials.grossRevenue);
    const b2b = await call(analyticsPath + '&channel=B2B'); assert.equal(b2b.body.data.financials.grossRevenue, 200);
    const outside = await call(analyticsPath + '&geofence=Forbidden'); assert.equal(outside.body.data.financials.grossRevenue, 0);
});

test('geography and order filter choices do not disclose other service areas or customer names', async () => {
    const filters = await call('/api/admin/dashboard-analytics/filters'); assert.equal(filters.status, 200);
    assert.ok(!JSON.stringify(filters.body).includes('Secret')); assert.ok(!JSON.stringify(filters.body).includes('Forbidden'));
    const orders = await call('/api/orders/all?page=1&limit=100'); assert.equal(orders.status, 200);
    // The outside customer has one authorized historical order, so its name is
    // legitimate there; this fixture also verifies an unrelated outside-only name.
    await User.updateOne({ _id: outsideCustomer._id }, { displayName: 'Historical party' });
    const outsider = await User.create({ phone: '9944000099', role: 'Customer', displayName: 'Never visible', location: { lat: 5, lng: 5 } });
    await Order.create({ customer: outsider._id, pickupLocation: { lat: 5, lng: 5 }, pickupAddress: 'Outside', dropAddress: 'Outside', totalAmount: 99999, items: [] });
    const updated = await call('/api/orders/all?page=1&limit=100');
    assert.ok(!updated.body.filterOptions.customerNames.includes('Never visible'));
    assert.ok(!updated.body.filterOptions.serviceZones.includes('Forbidden'));
});

test('customer report preserves calculations for authorized orders and archived parties', async () => {
    const res = await call('/api/admin/customer-payments'); assert.equal(res.status, 200);
    const active = res.body.find(row => row._id === String(customer._id));
    assert.equal(active.totalSpent, 150); assert.equal(active.totalOrders, 2); assert.equal(active.totalAdvancePaid, 10);
    assert.ok(res.body.some(row => row.displayName === 'Archived allowed' && row.totalSpent === 500));
    assert.ok(!res.body.some(row => row._id === String(outsideCustomer._id)));
    assert.equal((await call('/api/admin/customer-payments', admin)).body.find(row => row._id === String(customer._id)).totalSpent, 70150);
});

test('unallocated vendor settlement reports are denied to scoped admins and remain available to owners/unrestricted admins', async () => {
    for (const path of ['/api/admin/vendor-payments', `/api/admin/vendor-payouts/${vendor._id}`, `/api/auth/vendor-payouts/${vendor._id}`, `/api/auth/vendor-earnings?vendorId=${vendor._id}`]) assert.equal((await call(path)).status, 403, path);
    assert.equal((await call('/api/admin/vendor-payments', admin)).status, 200);
    assert.equal((await call(`/api/auth/vendor-payouts/${vendor._id}`, vendor)).status, 200);
    assert.equal((await call(`/api/auth/vendor-earnings?vendorId=${vendor._id}`, vendor)).status, 200);
});

test('sidebar support/dispute badges use real scoped ticket records', async () => {
    const res = await call('/api/admin/sidebar-counts'); assert.equal(res.status, 200);
    assert.equal(res.body.supportTickets, 1); assert.equal(res.body.disputes, 1);
    const all = await call('/api/admin/sidebar-counts', admin); assert.equal(all.body.supportTickets, 3); assert.equal(all.body.disputes, 1);
});

test('role checks and scope changes apply on every report request', async () => {
    assert.equal((await call('/api/admin/stats', customer)).status, 403);
    assert.equal((await call(analyticsPath, null)).status, 401);
    await User.updateOne({ _id: scoped._id }, { geofenceRestrictions: ['No matching area'] });
    assert.equal((await call('/api/admin/stats')).body.stats.totalOrders, 0);
    assert.equal((await call('/api/admin/customer-payments')).body.length, 0);
    await User.updateOne({ _id: scoped._id }, { geofenceRestrictions: ['Allowed'] });
});


test('supplier-code collisions and outside job applications cannot widen report counts', async () => {
    await User.create({ phone: '8844000007', role: 'Supplier', status: 'approved', location: { lat: 5, lng: 5 } });
    const categoryId = new mongoose.Types.ObjectId();
    await VendorMasterSupply.create([
        { skuId: 'REPORT-TEMPLATE', supplierId: '-', materialName: 'Shared template', serialNumber: 1, categoryId, isActive: 'n' },
        { skuId: 'REPORT-COLLISION', supplierId: 'SUP-0007', materialName: 'Ambiguous supplier', serialNumber: 2, categoryId },
        { skuId: 'REPORT-OWNED', supplierId: String(supplier._id), materialName: 'Owned supplier', serialNumber: 3, categoryId }
    ]);
    const jobs = await Job.create([
        { title: 'Local job', vendor: vendor._id, pincode: '111111' }, { title: 'Outside job', vendor: vendor._id, pincode: '222222' }
    ]);
    await JobApplication.create(jobs.map(job => ({ job: job._id, applicant: customer._id, applicantName: 'Test Applicant', creatorRole: 'Vendor' })));
    await MasterService.create([{ itemName: 'Active shared service', categoryId, basePrice: 10, isActive: true }, { itemName: 'Inactive shared service', categoryId, basePrice: 10, isActive: false }]);
    const res = await call(analyticsPath); assert.equal(res.status, 200);
    assert.equal(res.body.data.catalogB2B.totalProducts, 2); assert.equal(res.body.data.catalogB2B.inactiveProducts, 1);
    assert.equal(res.body.data.catalogB2C.totalServices, 1); assert.equal(res.body.data.catalogB2C.inactiveServices, 1);
    assert.ok(!('atsLaborExchange' in res.body.data));
    assert.ok(!('talentRequisitionIndex' in res.body.data.vendorPerformance));
    const unrestricted = await call(analyticsPath, admin);
    assert.ok(!('atsLaborExchange' in unrestricted.body.data));
    assert.ok(!('talentRequisitionIndex' in unrestricted.body.data.vendorPerformance));
});

test('invalid dates fail with a client error and admin account exports omit credentials', async () => {
    assert.equal((await call('/api/admin/dashboard-analytics?timeRange=Custom%20Range&startDate=bad')).status, 400);
    assert.equal((await call('/api/admin/sub-admins')).status, 403);
    await User.updateOne({ _id: admin._id }, { password: 'SECRET_HASH', activationToken: 'SECRET_ACTIVATION', fcmToken: 'SECRET_DEVICE' });
    const admins = await call('/api/admin/sub-admins', admin); assert.equal(admins.status, 200);
    assert.ok(!JSON.stringify(admins.body).includes('SECRET_'));
});


test('restricted admins cannot rewrite the boundaries that define their report permissions', async () => {
    const area = await ServiceArea.findOne({ areaName: 'Allowed' });
    const before = JSON.stringify(await ServiceArea.findById(area._id).lean());
    for (const [path, method, body] of [
        ['/api/geofence/areas', 'POST', { areaName: 'Allowed' }],
        [`/api/geofence/areas/${area._id}`, 'PATCH', { boundary: { type: 'Polygon', coordinates: [[[-180,-90],[180,-90],[180,90],[-180,90],[-180,-90]]] } }],
        [`/api/geofence/areas/${area._id}`, 'DELETE']
    ]) assert.equal((await api(env.baseUrl, path, { token: tokenFor('Admin', String(scoped._id)), method, body })).status, 403);
    assert.equal(JSON.stringify(await ServiceArea.findById(area._id).lean()), before);
    const allowed = await api(env.baseUrl, `/api/geofence/areas/${area._id}`, { token: tokenFor('Admin', String(admin._id)), method: 'PATCH', body: { color: '#123456' } });
    assert.equal(allowed.status, 200); assert.equal(allowed.body.color, '#123456');
});

test('analytics intersect dates, customer geography and monthly channel totals without registration-date coupling', async () => {
    const actor = await User.create({ role: 'Customer', phone: '9944556677', status: 'approved', addresses: [{ address: 'Cohort address', city: 'Cohort City', state: 'Cohort State', pincode: '111111' }], createdAt: new Date('2001-01-01') });
    const fresh = await Order.create({ customer: actor._id, pickupAddress: 'Pickup', dropAddress: 'Drop', status: 'ORDER_PLACED', totalAmount: 321, pickupLocation: { lat: 1, lng: 1 } });
    await Order.collection.updateOne({ _id: fresh._id }, { $set: { createdAt: new Date('2026-04-15T01:00:00Z') } });
    const result = await call('/api/admin/dashboard-analytics?channel=B2C&city=Cohort%20City&timeRange=Custom%20Range&startDate=2026-04-01&endDate=2026-04-30', admin);
    assert.equal(result.status, 200); assert.equal(result.body.data.financials.grossRevenue, 321); assert.equal(result.body.data.customerAnalytics.totalCustomers, 1);
    assert.equal(result.body.data.monthlyTrend.reduce((sum, row) => sum + row.Revenue, 0), 321);
    const collision = await call(analyticsPath + '&channel=B2B&pincode=222222&geofence=Allowed', admin);
    assert.equal(collision.body.data.financials.grossRevenue, 0);
    const current = await call('/api/admin/dashboard-analytics?timeRange=Today', admin);
    assert.equal(current.body.data.orderLifecycleB2C.immediateTimeouts, 0);
});
