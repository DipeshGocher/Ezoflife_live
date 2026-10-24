import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';

/**
 * Vendor and Supplier portals.
 *
 * Both are phone+OTP portals like the customer app. These specs log in through
 * the API and then exercise the authenticated screens, checking that each route
 * renders without an uncaught error and that the portals stay isolated from
 * one another.
 */

const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:5099/api';
const uniquePhone = () => `9${String(Date.now()).slice(-9)}`;

const loginAs = async (request, role) => {
    const phone = uniquePhone();
    await request.post(`${API_URL}/auth/request-otp`, {
        data: { phone, role, channel: 'SMS' }
    });
    const res = await request.post(`${API_URL}/auth/verify-otp`, {
        data: { phone, otp: '123456' }
    });
    const body = await res.json();
    expect(res.ok(), 'persona login must succeed').toBe(true);
    const userId = body.user?._id || body.user?.id;
    expect(userId).toBeTruthy();
    const admin = jwt.sign({ id: '6a7d56c980a151d5ad8b17d0', role: 'Admin' }, process.env.JWT_SECRET || 'e2e_secret_key', { expiresIn: '30m' });
    const activated = await request.patch(`${API_URL}/auth/profile/update/${userId}`, { headers: { Authorization: `Bearer ${admin}` }, data: { status: 'approved', isProfileComplete: true } });
    expect(activated.ok(), 'fixture persona must be active, not an onboarding redirect').toBe(true);
    return { phone, token: body.token, user: await activated.json(), ok: res.ok() };
};

/** Seed the browser with a session the portal will accept. */
const applySession = (page, session, extraKeys = {}) =>
    page.evaluate(({ user, token, extra }) => {
        localStorage.setItem('user', JSON.stringify(user || {}));
        localStorage.setItem('token', token || '');
        for (const [k, v] of Object.entries(extra)) {
            localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
    }, { user: session.user, token: session.token, extra: extraKeys });

const VENDOR_ROUTES = [
    '/vendor/dashboard', '/vendor/services', '/vendor/my-services',
    '/vendor/earnings', '/vendor/payouts', '/vendor/profile',
    '/vendor/notifications', '/vendor/more', '/vendor/order-history',
    '/vendor/walk-in', '/vendor/promotions', '/vendor/reports'
];

const SUPPLIER_ROUTES = [
    '/supplier/dashboard', '/supplier/supplies', '/supplier/my-supplies',
    '/supplier/logistics', '/supplier/wallet', '/supplier/profile',
    '/supplier/addresses', '/supplier/more', '/supplier/notifications'
];

test.describe('Vendor portal', () => {
    test('the vendor auth screen renders a phone input', async ({ page }) => {
        await page.goto('/vendor/auth');
        await expect(page.locator('input[type="tel"], input[type="number"]').first())
            .toBeVisible({ timeout: 20_000 });
    });

    test('a vendor can authenticate through the API', async ({ request }) => {
        const session = await loginAs(request, 'Vendor');
        expect(session.ok).toBe(true);
        expect(session.token).toBeTruthy();
        expect(session.user.role).toBe('Vendor');
    });

    test('every vendor screen renders without an uncaught error', async ({ page, request }) => {
        const session = await loginAs(request, 'Vendor');

        await page.goto('/vendor/auth');
        await applySession(page, session, {
            vendorData: session.user,
            vendorToken: session.token
        });

        const failures = [];
        for (const route of VENDOR_ROUTES) {
            const errors = [];
            const onError = e => errors.push(e.message);
            page.on('pageerror', onError);

            await page.goto(route);
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(600);
            await expect(page.locator('#root')).toBeAttached();
            expect(new URL(page.url()).pathname, 'route must render its intended screen').toBe(route);

            page.off('pageerror', onError);
            if (errors.length) failures.push(`${route} → ${errors.join(' ; ')}`);
        }

        expect(failures, `screens threw:\n${failures.join('\n')}`).toHaveLength(0);
    });

    test('the vendor dashboard requests its data from the API', async ({ page, request }) => {
        const session = await loginAs(request, 'Vendor');
        const calls = [];
        page.on('request', r => {
            if (r.url().includes('/api/')) calls.push(new URL(r.url()).pathname);
        });

        await page.goto('/vendor/auth');
        await applySession(page, session, { vendorData: session.user, vendorToken: session.token });
        await page.goto('/vendor/dashboard');
        await page.waitForLoadState('networkidle');

        expect(calls.length, 'dashboard made no API calls').toBeGreaterThan(0);
    });
});

test.describe('Supplier portal', () => {
    test('the supplier auth screen renders', async ({ page }) => {
        await page.goto('/supplier/auth');
        await expect(page.locator('#root')).toBeAttached();
        await expect(page.locator('input:visible').first()).toBeVisible({ timeout: 20_000 });
    });

    test('a supplier can authenticate through the API', async ({ request }) => {
        const session = await loginAs(request, 'Supplier');
        expect(session.ok).toBe(true);
        expect(session.user.role).toBe('Supplier');
    });

    test('every supplier screen renders without an uncaught error', async ({ page, request }) => {
        const session = await loginAs(request, 'Supplier');

        await page.goto('/supplier/auth');
        await applySession(page, session, {
            supplierData: session.user,
            supplierToken: session.token
        });

        const failures = [];
        for (const route of SUPPLIER_ROUTES) {
            const errors = [];
            const onError = e => errors.push(e.message);
            page.on('pageerror', onError);

            await page.goto(route);
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(600);
            await expect(page.locator('#root')).toBeAttached();
            expect(new URL(page.url()).pathname, 'route must render its intended screen').toBe(route);

            page.off('pageerror', onError);
            if (errors.length) failures.push(`${route} → ${errors.join(' ; ')}`);
        }

        expect(failures, `screens threw:\n${failures.join('\n')}`).toHaveLength(0);
    });
});

test.describe('portal isolation', () => {
    test('a vendor session does not unlock the admin panel', async ({ page, request }) => {
        const session = await loginAs(request, 'Vendor');

        const res = await request.get(`${API_URL}/admin/users`, {
            headers: { Authorization: `Bearer ${session.token}` }
        });
        expect(res.status(), 'a vendor token reached admin data').toBe(403);

        await page.goto('/admin/dashboard');
        await page.waitForURL(/\/admin\/login/, { timeout: 20_000 });
    });

    test('a supplier token cannot delete orders', async ({ request }) => {
        const session = await loginAs(request, 'Supplier');
        const res = await request.delete(`${API_URL}/orders/60000000000000000000000b`, {
            headers: { Authorization: `Bearer ${session.token}` }
        });
        expect(res.status()).toBe(403);
    });
});
