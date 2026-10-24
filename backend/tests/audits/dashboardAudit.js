// Manual, isolated acceptance audit. Reports discrepancies without changing app behavior.
// Run: node tests/audits/dashboardAudit.js
import mongoose from 'mongoose';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import User from '../../src/models/User.js';
import Order from '../../src/models/Order.js';
import B2BOrder from '../../src/models/B2BOrder.js';
import Ticket from '../../src/models/Ticket.js';
import Payout from '../../src/models/Payout.js';
import ServiceArea from '../../src/models/ServiceArea.js';
import VendorMasterSupply from '../../src/models/VendorMasterSupply.js';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';
const observations = [];
const record = (id, description, expected, actual) => {
    let conforms = true; try { assert.deepEqual(actual, expected); } catch { conforms = false; }
    observations.push({ id, description, expected, actual, conforms });
};
let env;
try {
    env = await startTestEnvironment({ env: { SHIPROCKET_ENABLED: 'false', WHATSAPP_ENABLED: 'false' } });
    await mongoose.connect(env.mongoUri);
    const [admin, customer, vendor, supplier] = await User.create(['Admin', 'Customer', 'Vendor', 'Supplier'].map((role, index) => ({ role, status: 'approved', phone: `989900000${index}`, displayName: `Dashboard audit ${role}`, location: { lat: 12.9, lng: 77.6 }, addresses: [{ address: 'Fixture only', city: 'Bengaluru', state: 'Karnataka', pincode: '560001', location: { lat: 12.9, lng: 77.6 }, isDefault: true }], ...(role === 'Supplier' ? { supplierDetails: { businessName: 'Fixture Trading', entityType: 'Wholesaler' } } : {}) })));
    const call = async (query = 'timeRange=Last%2030%20Days') => {
        const result = await api(env.baseUrl, `/api/admin/dashboard-analytics?${query}`, { token: tokenFor('Admin', String(admin._id)) });
        assert.equal(result.status, 200); return result.body;
    };
    const base = { customer: customer._id, vendor: vendor._id, pickupAddress: 'Fixture only', dropAddress: 'Fixture only', pickupLocation: { lat: 12.9, lng: 77.6 }, items: [{ serviceId: 'audit-service', name: 'Fixture service', quantity: 1, price: 100 }], totalAmount: 100, priceBreakdown: { platformFee: 10, logisticsFee: 20 } };
    await Order.create(['PROCESSING', 'DELIVERED', 'CANCELLED'].map(status => ({ ...base, status })));
    await Ticket.create({ customer: customer._id, subject: 'Technical assistance', description: 'Fixture only', category: 'Others', status: 'Open' });
    await ServiceArea.create({ areaName: 'MIXED ZONE', city: 'Bengaluru', pincodes: ['560001'], boundary: { type: 'Polygon', coordinates: [[[77,12],[78,12],[78,14],[77,14],[77,12]]] } });
    await VendorMasterSupply.create(['y', 'n'].map((isActive, index) => ({ skuId: `AUDIT-${index}`, serialNumber: index + 1, categoryId: new mongoose.Types.ObjectId(), materialName: `Fixture ${index}`, isActive })));
    const b2c = await call('timeRange=Last%2030%20Days&channel=B2C');
    record('ACTIVE', 'Active-card source excludes delivered and cancelled orders', 1, b2c.data.orderLifecycleB2C.totalSubmitted);
    record('DISPUTES', 'Open-dispute source excludes technical support tickets', 0, b2c.data.helpdesk.open);
    record('ACTIVE_SKU', 'B2B active-SKU source excludes inactive products', 1, b2c.data.catalogB2B.totalProducts);
    record('WHOLESALER', 'Supplier classification respects explicit entityType', 1, b2c.data.supplierAnalytics.wholesalers);
    record('NO_PAID_PAYOUT', 'Payout chart amount equals recorded completed transfers', 0, b2c.data.financials.vendorPayouts);
    record('B2C_BOOKED', 'Non-cancelled B2C booked value is correctly summed', 200, b2c.data.financials.grossRevenue);
    record('MONTH_SUM', 'Whole-rupee monthly B2C values agree with booked total', 200, b2c.data.monthlyTrend.reduce((sum, row) => sum + row.Revenue, 0));
    assert.equal(await Payout.countDocuments(), 0);
    const filters = await api(env.baseUrl, '/api/admin/dashboard-analytics/filters', { token: tokenFor('Admin', String(admin._id)) });
    assert.equal(filters.status, 200);
    record('STATE', 'Bengaluru geofence is not assigned to an invented Madhya Pradesh state', false, Boolean(filters.body.data.stateCityMap['Madhya Pradesh']?.includes('Bengaluru')));
    const label = filters.body.data.geofenceMap.Bengaluru[0];
    const selected = await call(`timeRange=Last%2030%20Days&channel=B2C&geofence=${encodeURIComponent(JSON.stringify([label]))}`);
    record('GEOFENCE', 'A returned geofence option round-trips to matching orders', 200, selected.data.financials.grossRevenue);
    const statuses = ['DELIVERED', 'Delivered', 'SETTLED', 'Settled', 'CART', 'PENDING_PAYMENT', 'Cancelled'];
    await B2BOrder.create(statuses.map((status, index) => ({ vendor: vendor._id, supplier: supplier._id, cycleId: `audit-${index}`, deliveryDay: 'Sunday', deliveryDate: new Date(), pincode: '560001', totalAmount: 50, status, items: [] })));
    const b2b = await call('timeRange=Last%2030%20Days&channel=B2B');
    record('B2B_STATUS', 'Delivered/settled B2B metric supports persisted canonical and legacy variants', 4, b2b.data.orderLifecycleB2B.delivered);
    record('B2B_GMV', 'B2B booked GMV excludes carts, pending-payment drafts and legacy cancellations', 200, b2b.data.financials.grossRevenue);
    const old = await Order.create({ ...base, status: 'ORDER_PLACED', totalAmount: 11 });
    await Order.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date(Date.now() - 40 * 86400000) } });
    const today = await call('timeRange=Today&channel=B2C');
    record('OVERDUE_COHORT', 'An unresolved 40-day pickup remains visible in the default current-exception count', 1, today.data.orderLifecycleB2C.sla.pickup2h);
    const allCase = await call(`timeRange=Last%2030%20Days&channel=B2B&pincode=999999&geofence=${encodeURIComponent(JSON.stringify(['MIXED ZONE']))}`);
    record('FILTER_INTERSECTION', 'Pincode and geofence intersect instead of overriding one another', 0, allCase.data.financials.grossRevenue);
    const scoped = await User.create({ role: 'Admin', status: 'approved', phone: '9899000010', geofenceRestrictions: ['UNASSIGNED'] });
    const scopedResult = await api(env.baseUrl, '/api/admin/dashboard-analytics?timeRange=Last%2030%20Days', { token: tokenFor('Admin', String(scoped._id)) });
    record('SCOPE', 'Unknown assigned area fails closed for order totals', 0, scopedResult.body.data.financials.grossRevenue);
    const invalid = await api(env.baseUrl, '/api/admin/dashboard-analytics?timeRange=Custom%20Range&startDate=2026-02-30&endDate=2026-03-01', { token: tokenFor('Admin', String(admin._id)) });
    record('INVALID_DATES', 'Invalid calendar dates are rejected', 400, invalid.status);
    await Order.create({ ...base, status: 'DELIVERED', totalAmount: 0.49 });
    const decimal = await call('timeRange=Last%2030%20Days&channel=B2C');
    record('MONTH_DECIMALS', 'Monthly values preserve the same currency precision as the headline total', decimal.data.financials.grossRevenue, decimal.data.monthlyTrend.reduce((sum, row) => sum + row.Revenue, 0));
    const recentCustomer = await User.create({ role: 'Customer', status: 'approved', phone: '9899000011' });
    const recent = await Order.create({ ...base, customer: recentCustomer._id, status: 'DELIVERED' });
    await Order.collection.updateOne({ _id: recent._id }, { $set: { createdAt: new Date(Date.now() - 86400000) } });
    const churn = await call('timeRange=Today&channel=B2C');
    record('CHURN_WINDOW', 'A customer who ordered yesterday is not labelled 30-day inactive by Today selection', 0, churn.data.customerAnalytics.churnRisk);
    const output = { auditDate: '2026-10-24', environment: 'Disposable local MongoDB/Express; providers disabled; fixtures only', observations };
    await writeFile(new URL('../../../docs/admin-audit/dashboard-audit-observations.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify(output, null, 2));
} finally {
    await mongoose.disconnect();
    if (env) await env.stop();
}
