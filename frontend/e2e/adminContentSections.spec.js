import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Browser end-to-end for Advertise, FAQ Manager, Privacy Policy, Terms &
 * Conditions, Partnerships and Customer Feedback: what customers submit shows
 * up in the admin panel, and what admins publish shows up in the app.
 */

const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:5099/api';
const ADMIN_ID = '6a7d56c980a151d5ad8b17d0';
const adminToken = () => jwt.sign({ id: ADMIN_ID, role: 'Admin', phone: '0000000000' }, process.env.JWT_SECRET || 'e2e_secret_key', { expiresIn: '1h' });
const adminHeaders = () => ({ Authorization: `Bearer ${adminToken()}` });
const stamp = Date.now().toString().slice(-6);
const BACKEND_DIR = fileURLToPath(new URL('../../backend/', import.meta.url));
const uploadedFiles = [];

const loginCustomer = async (request) => {
    const phone = `8${String(Date.now()).slice(-9)}`;
    await request.post(`${API_URL}/auth/request-otp`, { data: { phone, role: 'Customer', channel: 'SMS' } });
    const res = await request.post(`${API_URL}/auth/verify-otp`, { data: { phone, otp: '123456' } });
    return res.json();
};

const asCustomer = async (page, session) => {
    await page.goto('/user/auth', { waitUntil: 'commit' });
    await page.evaluate(({ user, token }) => {
        const u = { ...user, displayName: user.displayName || 'E2E Customer', address: user.address || '1 Test Road', isProfileComplete: true };
        localStorage.setItem('user', JSON.stringify(u));
        localStorage.setItem('userData', JSON.stringify(u));
        localStorage.setItem('token', token);
        localStorage.setItem('userRole', 'customer');
    }, session);
};

const asAdmin = async (page) => {
    await page.goto('/admin/login');
    await page.evaluate(({ token, id }) => {
        localStorage.setItem('adminAuth', 'true');
        localStorage.setItem('adminToken', token);
        localStorage.setItem('adminData', JSON.stringify({ _id: id, role: 'Admin' }));
    }, { token: adminToken(), id: ADMIN_ID });
};

test.describe.configure({ mode: 'serial' });

test.describe('Admin content sections end to end', () => {
    // The e2e backend writes uploads into backend/uploads: remove test files.
    test.afterAll(async () => {
        for (const f of uploadedFiles) await unlink(BACKEND_DIR + f.replace(/^\//, '')).catch(() => {});
    });

    test('Customer Feedback: a customer submits in the app, the admin sees it', async ({ page, request }) => {
        const session = await loginCustomer(request);
        await asCustomer(page, session);
        await page.goto('/user/feedback');
        const comment = `E2E feedback ${stamp}: pickup was quick`;
        await page.locator('textarea').fill(comment);
        await page.getByRole('button', { name: /Send Feedback/ }).click();
        await expect(page.getByText('Thank You!')).toBeVisible();

        await asAdmin(page);
        await page.goto('/admin/feedback');
        await expect(page.locator('tbody').getByText(comment, { exact: false })).toBeVisible();
    });

    test('Advertise: an inquiry reaches the admin, and the admin status reaches the brand', async ({ page, request }) => {
        const session = await loginCustomer(request);
        const brand = `E2E Brand ${stamp}`;
        const res = await request.post(`${API_URL}/media/inquiry`, {
            headers: { Authorization: `Bearer ${session.token}` },
            data: { brandName: brand, email: `brand${stamp}@e2e.test`, phone: '9000000009', location: 'Pan India', budget: 25000, timeline: 'Launch Boost' }
        });
        expect(res.status()).toBe(201);
        const inquiry = await res.json();

        await asAdmin(page);
        await page.goto('/admin/advertise');
        await expect(page.locator('tbody').getByText(brand)).toBeVisible();

        await request.put(`${API_URL}/media/inquiries/${inquiry._id}/status`, { headers: adminHeaders(), data: { status: 'Scheduled' } });
        const mine = await request.get(`${API_URL}/media/inquiries/my`, { headers: { Authorization: `Bearer ${session.token}` } });
        const list = await mine.json();
        expect(list.find(i => i._id === inquiry._id).status).toBe('Scheduled');
    });

    test('Partnerships: an inquiry reaches the admin panel', async ({ page, request }) => {
        const company = `E2E Partners ${stamp}`;
        const res = await request.post(`${API_URL}/partnerships/submit`, {
            data: { companyName: company, email: `p${stamp}@e2e.test`, phone: '9000000010', location: 'Indore', website: 'https://e2e.test', partnershipType: 'Logistics', proposal: 'Fleet' }
        });
        expect(res.status()).toBe(201);
        await asAdmin(page);
        await page.goto('/admin/partnerships');
        await expect(page.locator('tbody').getByText(company)).toBeVisible();
    });

    test('FAQ Manager: an admin FAQ appears in the app help pages', async ({ page, request }) => {
        const question = `E2E: How long does dry cleaning take ${stamp}?`;
        const res = await request.post(`${API_URL}/faqs`, {
            headers: adminHeaders(),
            data: { question, answer: 'Usually 48 hours.', category: 'General', targetRole: 'All' }
        });
        expect(res.status()).toBe(201);
        const faq = await res.json();

        await asAdmin(page);
        await page.goto('/admin/faqs');
        await expect(page.getByText(question).first()).toBeVisible();

        await page.goto('/user/faq');
        await expect(page.getByText(question).first()).toBeVisible();

        await request.delete(`${API_URL}/faqs/${faq._id}`, { headers: adminHeaders() });
    });

    test('Privacy Policy & Terms: a published PDF is offered in the app', async ({ page, request }) => {
        const up = await request.post(`${API_URL}/media/upload-pdf`, {
            headers: adminHeaders(),
            multipart: { media: { name: 'policy.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') } }
        });
        expect(up.status()).toBe(201);
        const { fileUrl } = await up.json();
        uploadedFiles.push(fileUrl);

        for (const type of ['privacy-policy-customer', 'terms-conditions-customer']) {
            const save = await request.post(`${API_URL}/legal/${type}`, { headers: adminHeaders(), data: { content: '', pdfUrl: fileUrl } });
            expect(save.status()).toBe(200);
        }

        // Admin page shows it as published
        await asAdmin(page);
        await page.goto('/admin/privacy-policy');
        await page.waitForLoadState('networkidle');
        await expect(page.getByText(/update the existing file/i)).toBeVisible();

        // Customer app links to the uploaded file
        for (const path of ['/privacy', '/terms']) {
            await page.goto(path);
            const link = page.locator(`a[href*="${fileUrl.split('/').pop()}"]`).first();
            await expect(link, `no link to the PDF on ${path}`).toBeVisible();
        }
    });
});
