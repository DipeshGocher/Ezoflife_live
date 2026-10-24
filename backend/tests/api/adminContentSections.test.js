/**
 * End-to-end checks for six admin sections and the app screens that feed them:
 *   Advertise (brand inquiries), FAQ Manager, Privacy Policy, Terms & Conditions,
 *   Partnerships, Customer Feedback.
 *
 * Each flow goes: app-side action -> stored -> admin sees/manages it -> app sees
 * the result, plus the access rules that keep other people's data private.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { startTestEnvironment, api } from '../helpers/testEnvironment.js';
import { createUser, tokenFor } from '../helpers/factories.js';

let env, admin, alice, bob, vendor, db;
const createdFiles = [];

before(async () => {
    env = await startTestEnvironment();
    admin = tokenFor('Admin');
    alice = await createUser(api, env.baseUrl, '9610000001', 'Customer');
    bob = await createUser(api, env.baseUrl, '9610000002', 'Customer');
    vendor = await createUser(api, env.baseUrl, '9610000003', 'Vendor');
    await mongoose.connect(env.mongoUri);
    db = mongoose.connection.db;
    await db.collection('users').updateOne({ _id: new mongoose.Types.ObjectId(alice.id) }, { $set: { email: 'alice@brand.test' } });
}, { timeout: 90000 });

after(async () => {
    for (const f of createdFiles) fs.promises.unlink(f).catch(() => {});
    await mongoose.disconnect().catch(() => {});
    if (env) await env.stop();
});

// ------------------------------------------------------------------
describe('Advertise (brand inquiries)', () => {
    const form = (over = {}) => ({ brandName: 'Glow Detergents', email: 'ads@glow.test', phone: '9000000001', location: 'Pan India', budget: 50000, timeline: 'Launch Boost', ...over });
    let anonId, aliceId, byEmailId;

    test('anyone can submit; signed-in submissions are linked to the user', async () => {
        const anon = await api(env.baseUrl, '/api/media/inquiry', { method: 'POST', body: form() });
        assert.equal(anon.status, 201, JSON.stringify(anon.body));
        anonId = anon.body._id;
        const mine = await api(env.baseUrl, '/api/media/inquiry', { method: 'POST', token: alice.token, body: form({ brandName: 'Alice Soaps', email: 'other@alice.test' }) });
        assert.equal(mine.status, 201);
        aliceId = mine.body._id;
        assert.equal(mine.body.submittedBy, alice.id);
        // Anonymous, but with Alice's account email
        const byEmail = await api(env.baseUrl, '/api/media/inquiry', { method: 'POST', body: form({ brandName: 'Alice Brand', email: 'ALICE@brand.test' }) });
        byEmailId = byEmail.body._id;
    });

    test('missing required fields are rejected', async () => {
        const res = await api(env.baseUrl, '/api/media/inquiry', { method: 'POST', body: { brandName: 'X' } });
        assert.equal(res.status, 400);
    });

    test('admin sees every inquiry and can update status and notes', async () => {
        const list = await api(env.baseUrl, '/api/media/inquiries', { token: admin });
        assert.equal(list.status, 200);
        assert.ok([anonId, aliceId, byEmailId].every(id => list.body.some(i => i._id === id)));
        assert.equal((await api(env.baseUrl, `/api/media/inquiries/${aliceId}/status`, { method: 'PUT', token: admin, body: { status: 'Running' } })).body.status, 'Running');
        assert.equal((await api(env.baseUrl, `/api/media/inquiries/${aliceId}/status`, { method: 'PUT', token: admin, body: { status: 'Bogus' } })).status, 400);
        assert.equal((await api(env.baseUrl, `/api/media/inquiries/${aliceId}/notes`, { method: 'PUT', token: admin, body: { notes: 'internal: low budget' } })).status, 200);
        assert.equal((await api(env.baseUrl, '/api/media/inquiries', { token: alice.token })).status, 403);
    });

    test('"my inquiries" is private: login required, own inquiries only, no internal notes', async () => {
        assert.equal((await api(env.baseUrl, '/api/media/inquiries/my?email=ads@glow.test')).status, 401);

        const mine = await api(env.baseUrl, '/api/media/inquiries/my?email=ads@glow.test', { token: alice.token });
        assert.equal(mine.status, 200);
        const ids = mine.body.map(i => i._id).sort();
        assert.deepEqual(ids, [aliceId, byEmailId].sort(), 'only Alice\'s own (by login or account email), not the ?email= one');
        assert.equal(mine.body.find(i => i._id === aliceId).status, 'Running', 'user sees the admin\'s status update');
        assert.ok(mine.body.every(i => !('notes' in i)), 'internal notes are never exposed');

        const bobs = await api(env.baseUrl, '/api/media/inquiries/my', { token: bob.token });
        assert.deepEqual(bobs.body, []);
    });

    test('admin can delete', async () => {
        assert.equal((await api(env.baseUrl, `/api/media/inquiries/${anonId}`, { method: 'DELETE', token: admin })).status, 200);
    });
});

// ------------------------------------------------------------------
describe('Partnerships', () => {
    const form = (over = {}) => ({ companyName: 'FastFleet', email: 'ops@fastfleet.test', phone: '9000000002', location: 'Indore', website: 'https://fastfleet.test', partnershipType: 'Logistics', proposal: 'Last-mile delivery', ...over });
    let aliceId;

    test('submit, admin manages, submitter sees status without internal notes', async () => {
        assert.equal((await api(env.baseUrl, '/api/partnerships/submit', { method: 'POST', body: form() })).status, 201);
        const mine = await api(env.baseUrl, '/api/partnerships/submit', { method: 'POST', token: alice.token, body: form({ companyName: 'Alice Logistics', email: 'x@alice.test' }) });
        assert.equal(mine.status, 201);
        aliceId = mine.body._id;

        const all = await api(env.baseUrl, '/api/partnerships/all', { token: admin });
        assert.equal(all.body.length, 2);
        assert.equal((await api(env.baseUrl, `/api/partnerships/${aliceId}/status`, { method: 'PUT', token: admin, body: { status: 'Proposal Sent' } })).status, 200);
        assert.equal((await api(env.baseUrl, `/api/partnerships/${aliceId}/status`, { method: 'PUT', token: admin, body: { status: 'Nope' } })).status, 400);
        assert.equal((await api(env.baseUrl, `/api/partnerships/${aliceId}/notes`, { method: 'PUT', token: admin, body: { notes: 'internal: call Monday' } })).status, 200);

        assert.equal((await api(env.baseUrl, '/api/partnerships/my-inquiries?email=ops@fastfleet.test')).status, 401);
        const aliceSees = await api(env.baseUrl, '/api/partnerships/my-inquiries?email=ops@fastfleet.test', { token: alice.token });
        assert.deepEqual(aliceSees.body.map(i => i._id), [aliceId]);
        assert.equal(aliceSees.body[0].status, 'Proposal Sent');
        assert.ok(!('notes' in aliceSees.body[0]));
    });

    test('filters and delete are admin-only', async () => {
        assert.equal((await api(env.baseUrl, '/api/partnerships/filters', { token: admin })).status, 200);
        assert.equal((await api(env.baseUrl, `/api/partnerships/${aliceId}`, { method: 'DELETE', token: alice.token })).status, 403);
        assert.equal((await api(env.baseUrl, `/api/partnerships/${aliceId}`, { method: 'DELETE', token: admin })).status, 200);
    });
});

// ------------------------------------------------------------------
describe('FAQ Manager', () => {
    let faqId;

    test('admin creates FAQs per audience; apps read them publicly', async () => {
        const mk = (question, targetRole, extra = {}) => api(env.baseUrl, '/api/faqs', {
            method: 'POST', token: admin, body: { question, answer: `Answer to ${question}`, category: 'General', targetRole, ...extra }
        });
        const a = await mk('How do I book a pickup?', 'Customer');
        assert.equal(a.status, 201, JSON.stringify(a.body));
        faqId = a.body._id;
        await mk('How do supplier payouts work?', 'Supplier');
        await mk('Is my data safe?', 'All');

        const list = await api(env.baseUrl, '/api/faqs');
        assert.equal(list.status, 200);
        assert.deepEqual(list.body.map(f => f.targetRole).sort(), ['All', 'Customer', 'Supplier']);
    });

    test('only admins can change FAQs', async () => {
        assert.equal((await api(env.baseUrl, '/api/faqs', { method: 'POST', token: alice.token, body: { question: 'x', answer: 'y' } })).status, 403);
        assert.equal((await api(env.baseUrl, `/api/faqs/${faqId}`, { method: 'PATCH', token: vendor.token, body: { answer: 'hacked' } })).status, 403);
    });

    test('hidden FAQs are never sent to the apps, but the admin still sees them', async () => {
        const upd = await api(env.baseUrl, `/api/faqs/${faqId}`, { method: 'PATCH', token: admin, body: { answer: 'Tap Book Pickup on home.', isActive: false } });
        assert.equal(upd.status, 200);

        const publicList = await api(env.baseUrl, '/api/faqs');
        assert.ok(!publicList.body.some(x => x._id === faqId), 'hidden FAQ leaked to the public list');
        assert.ok(publicList.body.every(x => x.isActive !== false));

        const adminList = await api(env.baseUrl, '/api/faqs/admin/all', { token: admin });
        assert.equal(adminList.status, 200);
        const f = adminList.body.find(x => x._id === faqId);
        assert.equal(f.answer, 'Tap Book Pickup on home.');
        assert.equal(f.isActive, false);
        assert.equal((await api(env.baseUrl, '/api/faqs/admin/all', { token: alice.token })).status, 403);
        assert.equal((await api(env.baseUrl, '/api/faqs/admin/all')).status, 401);

        // Showing it again puts it back in the apps
        await api(env.baseUrl, `/api/faqs/${faqId}`, { method: 'PATCH', token: admin, body: { isActive: true } });
        assert.ok((await api(env.baseUrl, '/api/faqs')).body.some(x => x._id === faqId));
        assert.equal((await api(env.baseUrl, `/api/faqs/${faqId}`, { method: 'DELETE', token: admin })).status, 200);
    });
});

// ------------------------------------------------------------------
describe('Privacy Policy & Terms (PDF documents)', () => {
    const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const uploadPdf = async (token) => {
        const form = new FormData();
        form.append('media', new Blob([PDF], { type: 'application/pdf' }), 'policy.pdf');
        const res = await fetch(`${env.baseUrl}/api/media/upload-pdf`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
        return { status: res.status, body: await res.json().catch(() => ({})) };
    };

    test('only admins can upload document files', async () => {
        assert.equal((await uploadPdf(null)).status, 401);
        assert.equal((await uploadPdf(alice.token)).status, 403);
    });

    test('admin uploads and publishes; each app gets its own document', async () => {
        const up = await uploadPdf(admin);
        assert.equal(up.status, 201, JSON.stringify(up.body));
        const fileUrl = up.body.fileUrl;
        createdFiles.push(path.join(process.cwd(), fileUrl));

        for (const type of ['privacy-policy-customer', 'terms-conditions-vendor']) {
            const save = await api(env.baseUrl, `/api/legal/${type}`, { method: 'POST', token: admin, body: { content: '', pdfUrl: fileUrl } });
            assert.equal(save.status, 200);
        }
        const customer = await api(env.baseUrl, '/api/legal/privacy-policy-customer');
        assert.equal(customer.status, 200);
        assert.equal(customer.body.pdfUrl, fileUrl);

        // The PDF itself is downloadable by the apps
        const file = await fetch(`${env.baseUrl}/${fileUrl.replace(/^\//, '')}`);
        assert.equal(file.status, 200);

        // Not yet published for suppliers -> 404 (apps show "not available yet")
        assert.equal((await api(env.baseUrl, '/api/legal/privacy-policy-supplier')).status, 404);
        assert.equal((await api(env.baseUrl, '/api/legal/terms-conditions-vendor')).body.pdfUrl, fileUrl);
    });

    test('only admins can publish documents', async () => {
        const res = await api(env.baseUrl, '/api/legal/privacy-policy-customer', { method: 'POST', token: alice.token, body: { pdfUrl: 'uploads/evil.pdf' } });
        assert.equal(res.status, 403);
    });

    test('legal PDFs and other uploads never appear in the Media Kit history', async () => {
        const media = db.collection('media');
        const at = (m) => new Date(Date.now() - m * 60000);
        // Records made before uploads were tagged
        await media.insertMany([
            { fileName: 'kit-2025.pdf', fileUrl: 'https://res.cloudinary.com/demo/kit-2025.pdf', fileType: 'PDF', uploadedAt: at(30) },
            { fileName: 'privacy.pdf', fileUrl: 'uploads/1700000000-privacy.pdf', fileType: 'PDF', uploadedAt: at(20) },
            { fileName: 'chat-photo.jpg', fileUrl: 'https://res.cloudinary.com/demo/chat.jpg', fileType: 'IMAGE', uploadedAt: at(10) },
            // Tagged media kit (current behaviour)
            { fileName: 'kit-2026.pdf', fileUrl: 'https://res.cloudinary.com/demo/kit-2026.pdf', fileType: 'PDF', purpose: 'media-kit', uploadedAt: at(5) }
        ]);

        // A legal PDF uploaded now is not recorded as a media kit
        const before = await media.countDocuments();
        const up = await uploadPdf(admin);
        assert.equal(up.status, 201);
        createdFiles.push(path.join(process.cwd(), up.body.fileUrl));
        assert.equal(await media.countDocuments(), before, 'legal PDF upload created a media record');

        const history = await api(env.baseUrl, '/api/media/history');
        assert.deepEqual(history.body.map(m => m.fileName), ['kit-2026.pdf', 'kit-2025.pdf']);
        const latest = await api(env.baseUrl, '/api/media/latest');
        assert.equal(latest.body.fileName, 'kit-2026.pdf');
    });

    test('general media uploads require login', async () => {
        const form = new FormData();
        form.append('media', new Blob([PDF], { type: 'image/png' }), 'x.png');
        assert.equal((await fetch(`${env.baseUrl}/api/media/upload`, { method: 'POST', body: form })).status, 401);
        assert.equal((await fetch(`${env.baseUrl}/api/media/bulk-upload`, { method: 'POST', body: new FormData() })).status, 401);
    });
});

// ------------------------------------------------------------------
describe('Customer Feedback', () => {
    let aliceOrder, bobOrder, vendorId;

    before(async () => {
        vendorId = new mongoose.Types.ObjectId(vendor.id);
        const orders = db.collection('orders');
        const r1 = await orders.insertOne({ orderId: 'FB-1', customer: new mongoose.Types.ObjectId(alice.id), vendor: vendorId, status: 'DELIVERED', totalAmount: 300, createdAt: new Date() });
        const r2 = await orders.insertOne({ orderId: 'FB-2', customer: new mongoose.Types.ObjectId(bob.id), vendor: vendorId, status: 'DELIVERED', totalAmount: 300, createdAt: new Date() });
        aliceOrder = r1.insertedId.toString();
        bobOrder = r2.insertedId.toString();
    });

    const submit = (token, body) => api(env.baseUrl, '/api/feedback/submit', { method: 'POST', token, body });

    test('the Rate & Review screen payload is accepted (it was rejected before)', async () => {
        // Exactly what RateAndReviewPage used to send: category 'order', possibly empty comment
        const res = await submit(alice.token, { orderId: aliceOrder, rating: 4, comment: '', category: 'order' });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.feedback.category, 'Service');
        assert.equal(res.body.feedback.vendor, vendor.id, 'vendor comes from the order');
    });

    test('the general feedback form payload is accepted', async () => {
        const res = await submit(bob.token, { rating: 5, comment: 'Love the app', category: 'Detailed Feedback' });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.feedback.category, 'App Experience');
        assert.equal(res.body.feedback.vendor, undefined);
    });

    test('identity and vendor cannot be spoofed', async () => {
        // Bob tries to review Alice's order
        assert.equal((await submit(bob.token, { orderId: aliceOrder, rating: 1, comment: 'x' })).status, 403);
        // Bob posts "as Alice" and "for another vendor": both ignored
        const spoof = await submit(bob.token, { userId: alice.id, orderId: bobOrder, vendorId: new mongoose.Types.ObjectId().toString(), rating: 3, comment: 'ok' });
        assert.equal(spoof.status, 201);
        assert.equal(spoof.body.feedback.user, bob.id);
        assert.equal(spoof.body.feedback.vendor, vendor.id);
        // Login required
        assert.equal((await submit(null, { rating: 5, comment: 'x' })).status, 401);
        assert.equal((await submit(alice.token, { rating: 9 })).status, 400);
    });

    test('re-reviewing the same order updates the review instead of duplicating it', async () => {
        const again = await submit(alice.token, { orderId: aliceOrder, rating: 2, comment: 'Clothes came back damp', category: 'order' });
        assert.equal(again.status, 200);
        const count = await db.collection('feedbacks').countDocuments({ order: new mongoose.Types.ObjectId(aliceOrder) });
        assert.equal(count, 1);
    });

    test('admin sees feedback with customer details, can filter and delete', async () => {
        const all = await api(env.baseUrl, '/api/feedback/all', { token: admin });
        assert.equal(all.status, 200);
        assert.equal(all.body.length, 3);
        const aliceFb = all.body.find(f => String(f.order?._id || f.order) === aliceOrder);
        assert.equal(aliceFb.rating, 2);
        assert.ok(aliceFb.user, 'customer populated');

        const low = await api(env.baseUrl, '/api/feedback/all?rating=2', { token: admin });
        assert.equal(low.body.length, 1);
        assert.equal((await api(env.baseUrl, '/api/feedback/filters', { token: admin })).status, 200);
        assert.equal((await api(env.baseUrl, '/api/feedback/all', { token: alice.token })).status, 403);

        // Vendor sees reviews of their own work
        const vendorView = await api(env.baseUrl, `/api/feedback/vendor/${vendor.id}`);
        assert.equal(vendorView.body.length, 2);

        assert.equal((await api(env.baseUrl, `/api/feedback/${aliceFb._id}`, { method: 'DELETE', token: admin })).status, 200);
    });
});
