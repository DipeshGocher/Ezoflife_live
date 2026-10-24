import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import Order from '../../src/models/Order.js';
import Ticket from '../../src/models/Ticket.js';
import Service from '../../src/models/Service.js';
import ServiceArea from '../../src/models/ServiceArea.js';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { tokenFor } from '../helpers/factories.js';
let env, admin, scoped, readonly, customer, other, vendor, vendor2, supplier, first, second, conversation;
const token = actor => tokenFor(actor.role, String(actor._id));
const call = (path, actor, method = 'GET', body) => api(env.baseUrl, path, { token: actor && token(actor), method, body });
const profile = (actor, target = actor) => call(`/api/auth/profile/${target._id}`, actor);
before(async () => {
    env = await startTestEnvironment({ env: { SHIPROCKET_ENABLED: 'false', WHATSAPP_ENABLED: 'false' } }); await mongoose.connect(env.mongoUri);
    [admin, scoped, readonly, customer, other, vendor, vendor2, supplier] = await User.create([
        { role: 'Admin' }, { role: 'Admin', geofenceRestrictions: ['Allowed'] }, { role: 'Admin', adminAccessType: 'Read-Only' },
        { role: 'Customer', password: 'PRIVATE_HASH', otp: 'SECRET_OTP', activationToken: 'PRIVATE_ACTIVATION', bankVerification: { amount: 0.37 } },
        { role: 'Customer', location: { lat: 5, lng: 5 } }, { role: 'Vendor', panDoc: 'https://example.invalid/pan', shopDetails: { services: [{ id: 'service-1', vendorRate: 100, adminRate: 120, status: 'approved' }] } },
        { role: 'Vendor' }, { role: 'Supplier', status: 'pending' }
    ].map((value, index) => ({ phone: `995500000${index}`, displayName: `History actor ${index}`, location: { lat: 1, lng: 1 }, status: 'approved', ...value })));
    await ServiceArea.create({ areaName: 'Allowed', isActive: true, boundary: { type: 'Polygon', coordinates: [[[0,0],[2,0],[2,2],[0,2],[0,0]]] } });
    [first, second] = await Order.create([1,5].map(point => ({ customer: customer._id, vendor: vendor._id, pickupAddress: 'Pickup', dropAddress: 'Drop', pickupLocation: { lat: point, lng: point }, totalAmount: 100, pickupOtp: '1234', deliveryOtp: '5678', items: [{ serviceId: 'test', name: 'Service', quantity: 1, price: 100 }] })));
    conversation = await Ticket.create({ customer: customer._id, order: first._id, subject: 'Recorded assistance', description: 'Private conversation', messages: [{ sender: customer._id, senderRole: 'Customer', message: 'Hello' }] });
    await Ticket.create({ customer: customer._id, order: second._id, subject: 'Outside conversation', description: 'Out of scope' });
}, { timeout: 90000 });
after(async () => { await mongoose.disconnect(); if (env) await env.stop(); });

test('anonymous profile, document, onboarding and cart routes require authentication', async () => {
    for (const [path, method, body] of [
        [`/profile/${customer._id}`, 'GET'], [`/profile/update/${customer._id}`, 'PATCH', { displayName: 'No' }],
        [`/update-documents/${customer._id}`, 'PATCH'], [`/update-profile-image/${customer._id}`, 'PATCH'],
        [`/become-vendor/${customer._id}`, 'PATCH'], [`/become-supplier/${customer._id}`, 'POST'],
        ['/complete-vendor-profile', 'POST'], [`/cart/${customer._id}`, 'GET'], [`/cart/${customer._id}`, 'POST', { cart: {} }]
    ]) assert.equal((await call(`/api/auth${path}`, null, method, body)).status, 401);
});

test('cross-account profile, cart and FCM access is denied without changing storage', async () => {
    const before = JSON.stringify(await User.findById(customer._id).lean());
    for (const [path, method, body] of [
        [`/profile/${customer._id}`, 'GET'], [`/profile/update/${customer._id}`, 'PATCH', { displayName: 'No' }],
        [`/cart/${customer._id}`, 'POST', { cart: { secret: true } }], ['/update-fcm-token', 'POST', { userId: String(customer._id), fcmToken: 'FORGED' }],
        [`/become-vendor/${customer._id}/submit-services`, 'PATCH', { services: [] }]
    ]) assert.equal((await call(`/api/auth${path}`, other, method, body)).status, 403);
    assert.equal(JSON.stringify(await User.findById(customer._id).lean()), before);
});

test('unauthorized multipart requests are rejected before upload processing', async () => {
    for (const suffix of ['update-documents', 'update-profile-image', 'become-vendor', 'become-supplier']) {
        const body = new FormData(); body.append(suffix === 'update-profile-image' ? 'image' : 'document', new Blob(['test']), 'test.txt');
        const res = await fetch(`${env.baseUrl}/api/auth/${suffix}/${customer._id}`, { method: suffix === 'become-supplier' ? 'POST' : 'PATCH', headers: { Authorization: `Bearer ${token(other)}` }, body });
        assert.equal(res.status, 403);
    }
});

test('owners and scoped/read-only admins retain permitted profile reads without GET repairs or credentials', async () => {
    const before = JSON.stringify(await User.findById(vendor._id).lean());
    const own = await profile(vendor);
    assert.equal(own.status, 200); assert.ok(own.body.documents.some(document => document.type === 'PAN Card'));
    assert.equal(JSON.stringify(await User.findById(vendor._id).lean()), before);
    for (const actor of [customer, scoped, readonly]) {
        const res = await profile(actor, customer); assert.equal(res.status, 200);
        for (const field of ['password', 'otp', 'otpExpiry', 'activationToken', 'fcmToken']) assert.equal(res.body[field], undefined);
        assert.equal(res.body.bankVerification.amount, undefined);
    }
    assert.equal((await profile(scoped, other)).status, 403);
    assert.equal((await call(`/api/auth/profile/update/${customer._id}`, readonly, 'PATCH', { displayName: 'No' })).status, 403);
});

test('profile edits support addresses, bank details and admin status changes but reject privilege fields', async () => {
    const res = await call(`/api/auth/profile/update/${customer._id}`, customer, 'PATCH', { displayName: 'Updated customer', addresses: [{ type: 'Home', address: 'Updated address', location: { lat: 1, lng: 1 }, isDefault: true }], isProfileComplete: true });
    assert.equal(res.status, 200); assert.equal(res.body.displayName, 'Updated customer'); assert.equal(res.body.password, undefined);
    for (const body of [{ role: 'Admin' }, { status: 'approved' }, { walletBalance: 5000 }, { isBlocked: false }, { adminAccessType: 'Read/Write' }, { onboardingStage: 'COMPLETED' }, { bankVerification: { isVerified: true } }, { 'shopDetails.services.0.status': 'approved' }]) assert.equal((await call(`/api/auth/profile/update/${customer._id}`, customer, 'PATCH', body)).status, 400);
    const bank = await call(`/api/auth/profile/update/${supplier._id}`, supplier, 'PATCH', { bankDetails: { bankName: 'Test Bank', accountNumber: '000000' } }); assert.equal(bank.status, 200);
    assert.equal((await call(`/api/auth/profile/update/${customer._id}`, scoped, 'PATCH', { status: 'rejected' })).status, 200);
    assert.equal((await User.findById(customer._id)).isBlocked, true);
    assert.equal((await call(`/api/auth/profile/update/${customer._id}`, scoped, 'PATCH', { status: 'approved' })).status, 200);
});

test('vendors cannot self-approve services or change admin prices through nested profile edits', async () => {
    assert.equal((await call(`/api/auth/profile/update/${vendor._id}`, vendor, 'PATCH', { shopDetails: { services: [{ id: 'new-service', status: 'approved' }] } })).status, 403);
    assert.equal((await call(`/api/auth/profile/update/${vendor._id}`, vendor, 'PATCH', { shopDetails: { services: [{ id: 'service-1', adminRate: 1 }] } })).status, 403);
    const existing = (await User.findById(vendor._id)).shopDetails.toObject();
    assert.equal((await call(`/api/auth/profile/update/${vendor._id}`, vendor, 'PATCH', { shopDetails: { ...existing, name: 'Renamed shop' } })).status, 200);
});

test('scoped admin edits cannot move an account outside permitted zones', async () => {
    const before = JSON.stringify(await User.findById(vendor._id).lean());
    assert.equal((await call(`/api/auth/profile/update/${vendor._id}`, scoped, 'PATCH', { location: { lat: 5, lng: 5 } })).status, 403);
    assert.equal(JSON.stringify(await User.findById(vendor._id).lean()), before);
});

test('pending/revision onboarding and cart persistence remain available to their owners', async () => {
    await User.updateOne({ _id: supplier._id }, { status: 'revision_required' });
    assert.equal((await profile(supplier)).status, 200);
    assert.equal((await call(`/api/auth/cart/${supplier._id}`, supplier, 'POST', { cart: { selectedQuantities: { service: 2 }, orderNotes: 'saved' } })).status, 200);
    assert.equal((await call(`/api/auth/cart/${supplier._id}`, supplier)).body.selectedQuantities.service, 2);
    const applicant = await User.create({ phone: '9955000099', role: 'Customer', status: 'approved', onboardingStage: 'SERVICE_SELECTION' });
    assert.equal((await call(`/api/auth/become-vendor/${applicant._id}/submit-services`, applicant, 'PATCH', { services: [] })).status, 200);
    assert.equal((await User.findById(applicant._id)).onboardingStage, 'FINAL_REVIEW');
    assert.equal((await call('/api/auth/complete-vendor-profile', vendor, 'POST', { phone: other.phone })).status, 403);
});

test('walk-in lookup and short-lived address authorization preserve vendor workflow without general profile access', async () => {
    assert.equal((await call(`/api/auth/lookup-phone/${customer.phone}`, customer)).status, 403);
    const lookup = await call(`/api/auth/lookup-phone/${customer.phone}`, vendor);
    assert.equal(lookup.status, 200); assert.ok(lookup.body.addressUpdateToken);
    const update = async (actor, id, proof, body) => {
        const res = await fetch(`${env.baseUrl}/api/auth/profile/update/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token(actor)}`, 'Content-Type': 'application/json', 'X-Walk-In-Authorization': proof }, body: JSON.stringify(body) });
        return { status: res.status, body: await res.json() };
    };
    assert.equal((await update(vendor, customer._id, '', { address: 'No' })).status, 403);
    assert.equal((await update(vendor2, customer._id, lookup.body.addressUpdateToken, { address: 'No' })).status, 403);
    assert.equal((await update(vendor, other._id, lookup.body.addressUpdateToken, { address: 'No' })).status, 403);
    assert.equal((await update(vendor, customer._id, lookup.body.addressUpdateToken, { displayName: 'No' })).status, 403);
    const valid = await update(vendor, customer._id, lookup.body.addressUpdateToken, { address: 'Walk-in destination' });
    assert.equal(valid.status, 200); assert.equal(valid.body.address, 'Walk-in destination');
    // The delegated response must not reveal the customer's private profile.
    assert.equal(valid.body.bankDetails, undefined); assert.equal(valid.body.documents, undefined); assert.equal(valid.body.addresses, undefined);
    const oldAddress = (await User.findById(customer._id)).addresses[0].address;
    assert.equal((await update(vendor, customer._id, lookup.body.addressUpdateToken, { addresses: [{ type: 'Home', address: 'New walk-in destination', location: { lat: 1, lng: 1 } }] })).status, 200);
    assert.ok((await User.findById(customer._id)).addresses.some(address => address.address === oldAddress));
    assert.equal((await update(vendor, customer._id, lookup.body.addressUpdateToken, { addresses: [] })).status, 400);
    assert.equal((await update(vendor, customer._id, lookup.body.addressUpdateToken, { addresses: [null] })).status, 400);
    await User.updateOne({ _id: customer._id }, { isBlocked: true });
    assert.equal((await update(vendor, customer._id, lookup.body.addressUpdateToken, { address: 'No' })).status, 403);
    assert.equal((await call(`/api/auth/lookup-phone/${customer.phone}`, vendor)).status, 403);
    await User.updateOne({ _id: customer._id }, { isBlocked: false });
    const expired = jwt.sign({ purpose: 'walkin-address', actorId: String(vendor._id), customerId: String(customer._id) }, process.env.JWT_SECRET || 'test_secret_key', { expiresIn: -1 });
    assert.equal((await update(vendor, customer._id, expired, { address: 'No' })).status, 403);
});

test('history requires admin scope and applies order/ticket visibility before totals and pagination', async () => {
    const path = `/api/admin/users/${customer._id}/history`;
    assert.equal((await call(path, customer)).status, 403); assert.equal((await call(path, null)).status, 401);
    const unrestricted = await call(`${path}?limit=1`, admin);
    assert.equal(unrestricted.status, 200); assert.equal(unrestricted.body.pagination.total, 2); assert.equal(unrestricted.body.data.length, 1);
    const visible = await call(path, scoped); assert.equal(visible.body.pagination.total, 1); assert.equal(visible.body.data[0]._id, String(first._id));
    assert.equal(visible.body.data[0].pickupOtp, undefined); assert.equal(visible.body.data[0].deliveryOtp, undefined);
    const tickets = await call(`${path}?section=tickets`, scoped); assert.equal(tickets.body.pagination.total, 1); assert.equal(tickets.body.data[0].subject, 'Recorded assistance'); assert.equal(tickets.body.data[0].messages, undefined);
    assert.equal((await call(`/api/admin/users/${other._id}/history`, scoped)).status, 403);
    assert.equal((await call(`/api/admin/users/${vendor._id}/history`, readonly)).body.pagination.total, 2);
    for (const query of ['page=0', 'limit=101', 'section=bad']) assert.equal((await call(`${path}?${query}`, admin)).status, 400);
});


test('owner vendor application submission retains the review workflow', async () => {
    const applicant = await User.create({ phone: '9955000098', role: 'Customer', status: 'approved' });
    const res = await call(`/api/auth/become-vendor/${applicant._id}`, applicant, 'PATCH', { ownerName: 'Applicant', facilityName: 'Test shop', businessType: 'Individual', serviceRates: {} });
    assert.equal(res.status, 200);
    const saved = await User.findById(applicant._id);
    assert.equal(saved.role, 'Customer'); assert.equal(saved.status, 'pending'); assert.equal(saved.onboardingStage, 'INITIAL_REVIEW');
});


test('already-approved owned custom services can be enabled without allowing forged approvals', async () => {
    const service = await Service.create({ name: 'Approved custom', category: 'Laundry', basePrice: 75, vendorId: vendor._id, isMaster: false, approvalStatus: 'Approved' });
    const res = await call(`/api/auth/profile/update/${vendor._id}`, vendor, 'PATCH', { shopDetails: { services: [{ id: String(service._id), vendorRate: 75, status: 'approved', active: true }] } });
    assert.equal(res.status, 200); assert.equal(res.body.shopDetails.services[0].adminRate, 75);
    const otherService = await Service.create({ name: 'Other vendor', category: 'Laundry', basePrice: 75, vendorId: vendor2._id, isMaster: false, approvalStatus: 'Approved' });
    assert.equal((await call(`/api/auth/profile/update/${vendor._id}`, vendor, 'PATCH', { shopDetails: { services: [{ id: String(otherService._id), vendorRate: 75, status: 'approved' }] } })).status, 403);
});
