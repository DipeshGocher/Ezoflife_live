import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestEnvironment, api, FIXTURE_SERVICE_ID } from '../helpers/testEnvironment.js';
import { createUser, makeVendorCapableOf, orderPayload } from '../helpers/factories.js';
let env, customer, vendor, id, connection;
const call = (session, path, method = 'GET', body) => api(env.baseUrl, path, { token: session.token, method, body });
before(async () => {
    env = await startTestEnvironment();
    customer = await createUser(api, env.baseUrl, '9361000001'); vendor = await createUser(api, env.baseUrl, '9361000002', 'Vendor');
    await makeVendorCapableOf(env.mongoUri, vendor.id, [FIXTURE_SERVICE_ID]);
    connection = await mongoose.createConnection(env.mongoUri).asPromise();
    await connection.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(customer.id) }, { $set: { gstNumber: '23ABCDE1234F1Z5', address: 'Customer address, Indore, Madhya Pradesh 452001', addresses: [{ address: 'Customer address', city: 'Indore', state: 'Madhya Pradesh', pincode: '452001', isDefault: true }] } });
    await connection.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(vendor.id) }, { $set: { 'shopDetails.gst': '23FGHIJ5678K1Z2', 'shopDetails.state': 'Madhya Pradesh' } });
    const created = await call(customer, '/api/orders', 'POST', orderPayload(customer.id)); assert.equal(created.status, 201, JSON.stringify(created.body)); id = created.body._id;
    assert.equal((await call(vendor, `/api/orders/vendor-accept/${id}`, 'POST', {})).status, 200);
    const delivered = await call(vendor, `/api/orders/status/${id}`, 'PATCH', { status: 'DELIVERED' }); assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
});
after(async () => { await connection?.close(); await env?.stop(); });
test('registered customer receives frozen reference-template figures without the vendor invoice', async () => {
    const result = await call(customer, `/api/orders/${id}`); assert.equal(result.status, 200);
    const invoice = result.body.invoices.customerInvoice; const details = invoice.presentation;
    assert.equal(invoice.scenario, 'A'); assert.equal(details.customerId, customer.id); assert.equal(details.vendorId, vendor.id);
    assert.equal(details.vendorNetPayout, result.body.ledger.vendorNetPayout);
    assert.equal(result.body.invoices.platformInvoice, undefined);
    const stored = await connection.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(id) });
    assert.deepEqual(details, stored.invoices.customerInvoice.presentation);
    assert.equal(stored.invoices.platformInvoice.presentation.scenario, 'A');
    assert.equal(stored.invoices.platformInvoice.presentation.serviceTax, stored.invoices.customerInvoice.presentation.serviceTax);
    const vendorInvoice = await call(vendor, `/api/orders/${id}/invoices`);
    assert.deepEqual(vendorInvoice.body.platformInvoice.presentation, stored.invoices.platformInvoice.presentation);
});
test('historical invoices can show their stored fees through a read without editing the finalized document', async () => {
    await connection.collection('orders').updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $unset: { 'invoices.customerInvoice.presentation': '' } });
    const before = await connection.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(id) });
    const response = await call(customer, `/api/orders/${id}`); assert.equal(response.status, 200);
    assert.equal(response.body.invoices.customerInvoice.presentation.platformFeeTax, before.invoices.platformInvoice.platformFeeTax);
    assert.equal(response.body.invoices.customerInvoice.presentation.vendorNetPayout, before.ledger.vendorNetPayout);
    assert.equal(response.body.invoices.platformInvoice, undefined);
    const after = await connection.collection('orders').findOne({ _id: before._id });
    assert.equal(after.invoices.customerInvoice.presentation, undefined);
    assert.equal(after.invoices.customerInvoice.invoiceNo, before.invoices.customerInvoice.invoiceNo);
    assert.equal(after.totalAmount, before.totalAmount);
});

for (const [scenario, registeredVendor] of [['B', true], ['C', false]]) {
    test(`${scenario}: unregistered customer receives its template's stored fees and single selected tax identity`, async () => {
        await connection.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(customer.id) }, { $set: { gstNumber: '' } });
        await connection.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(vendor.id) }, { $set: { 'shopDetails.gst': registeredVendor ? '23FGHIJ5678K1Z2' : '' } });
        const created = await call(customer, '/api/orders', 'POST', orderPayload(customer.id)); assert.equal(created.status, 201, JSON.stringify(created.body));
        const nextId = created.body._id;
        assert.equal((await call(vendor, `/api/orders/vendor-accept/${nextId}`, 'POST', {})).status, 200);
        const delivered = await call(vendor, `/api/orders/status/${nextId}`, 'PATCH', { status: 'DELIVERED' }); assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
        const stored = await connection.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(nextId) });
        assert.equal(stored.invoices.customerInvoice.scenario, scenario);
        if (['B','C'].includes(scenario)) {
            const details = stored.invoices.platformInvoice.presentation;
            assert.equal(details.scenario, scenario);
            assert.equal(details.serviceTax, stored.invoices.customerInvoice.presentation.serviceTax); assert.equal(details.vendorId, vendor.id);
            assert.equal(details.customerTotal, stored.invoices.customerInvoice.totalAmount);
            assert.equal(details.vendorNetPayout, stored.ledger.vendorNetPayout);
            assert.equal(details.services.length, stored.items.length);
            const vendorCopy = await call(vendor, `/api/orders/${nextId}/invoices`);
            assert.equal(vendorCopy.status, 200);
            assert.deepEqual(vendorCopy.body.platformInvoice.presentation, details);
        }

        assert.equal(stored.invoices.customerInvoice.presentation.platformFeeTax, stored.invoices.platformInvoice.platformFeeTax);
        // Old records use the same read-only adapter; invoice numbers/totals remain untouched.
        await connection.collection('orders').updateOne({ _id: stored._id }, { $unset: { 'invoices.customerInvoice.presentation': '' } });
        const response = await call(customer, `/api/orders/${nextId}`); assert.equal(response.status, 200);
        const invoice = response.body.invoices.customerInvoice;
        assert.equal(invoice.presentation.vendorNetPayout, stored.ledger.vendorNetPayout);
        assert.equal(invoice.presentation.spinzytGstin, stored.invoices.platformInvoice.spinzytGstin);
        assert.equal(invoice.displayGstinNo, registeredVendor ? '23FGHIJ5678K1Z2' : stored.invoices.platformInvoice.spinzytGstin);
        assert.equal(response.body.invoices.platformInvoice, undefined);
        assert.equal(invoice.totalAmount, stored.invoices.customerInvoice.totalAmount);
    });
}
