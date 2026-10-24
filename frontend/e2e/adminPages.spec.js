import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';

/**
 * Admin pages connected to the panel (Dashboard, Payments, Vendors, Settings)
 * and the pages whose mock data was removed. Each must load its data from the
 * API, render without uncaught errors, and show none of the old fake values.
 */

const SECRET = process.env.JWT_SECRET || 'e2e_secret_key';
const ADMIN_ID = '6a7d56c980a151d5ad8b17d0';

const signInAsAdmin = async (page) => {
    const token = jwt.sign({ id: ADMIN_ID, role: 'Admin', phone: '0000000000' }, SECRET, { expiresIn: '1h' });
    await page.goto('/admin/login');
    await page.evaluate(({ token, id }) => {
        localStorage.setItem('adminAuth', 'true');
        localStorage.setItem('adminToken', token);
        localStorage.setItem('adminData', JSON.stringify({ _id: id, role: 'Admin', displayName: 'E2E Admin' }));
    }, { token, id: ADMIN_ID });
};

// Strings that only ever came from hardcoded mock data
const FAKE_VALUES = ['99.9%', '1.2K', '12:45 PM', 'pay_rzp_', 'PAY-VND-', 'SBI ····', 'Main Hub', 'Gurgaon (HQ)', 'EzOfLife Corporate'];

const PAGES = [
    { path: '/admin/payments?tab=customer', api: '/api/admin/customer-payments', heading: 'Payments' },
    { path: '/admin/payments?tab=vendor', api: '/api/admin/vendor-payments', heading: 'Payments' },
    { path: '/admin/payments?tab=supplier', api: '/api/b2b-orders/admin/escrow', heading: 'Payments' },
    { path: '/admin/payments?tab=refunds', api: '/api/admin/refunds', heading: 'Payments' },
    { path: '/admin/vendors', api: '/api/admin/vendors' },
    { path: '/admin/settings', api: '/api/admin/config' },
    { path: '/admin/dashboard', api: '/api/admin/dashboard-analytics' }
];

test.describe('Admin pages load real data', () => {
    for (const p of PAGES) {
        test(`${p.path} renders from ${p.api}`, async ({ page }) => {
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            const apiStatuses = [];
            page.on('response', r => {
                if (new URL(r.url()).pathname === p.api) apiStatuses.push(r.status());
            });

            await signInAsAdmin(page);
            await page.goto(p.path);
            await page.waitForLoadState('networkidle');

            expect(page.url(), 'redirected away (auth failed)').toContain(p.path.split('?')[0]);
            expect(apiStatuses, `${p.api} was not called`).toContain(200);
            if (p.heading) await expect(page.getByRole('heading', { name: p.heading, exact: true }).first()).toBeVisible();

            const body = await page.locator('body').innerText();
            for (const fake of FAKE_VALUES) {
                expect(body, `mock value "${fake}" rendered on ${p.path}`).not.toContain(fake);
            }
            expect(errors, `uncaught errors on ${p.path}`).toHaveLength(0);
        });
    }

    test('sidebar links to the connected pages', async ({ page }) => {
        await signInAsAdmin(page);
        await page.goto('/admin/dashboard');
        await page.waitForLoadState('networkidle');
        await expect(page.getByText('Payments', { exact: true }).first()).toBeVisible();
        // Removed sections must not come back
        for (const label of ['Reports & Analytics', 'Labor Management']) {
            await expect(page.getByText(label, { exact: true })).toHaveCount(0);
        }
    });

    test('old URLs of merged pages redirect to the full pages', async ({ page }) => {
        await signInAsAdmin(page);
        await page.goto('/admin/customer-payments');
        await page.waitForURL(/\/admin\/payments\?tab=customer/);
        await page.goto('/admin/b2b-leads');
        await page.waitForURL(/\/admin\/partnerships/);
        for (const removed of ['/admin/analytics', '/admin/reports?type=tat', '/admin/labor']) {
            await page.goto(removed);
            await page.waitForURL(/\/admin\/dashboard/);
        }
    });
});
