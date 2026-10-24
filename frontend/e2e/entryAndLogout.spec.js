import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import process from 'node:process';

/**
 * The site root is the customer app. A leftover admin session in the browser
 * must never redirect "/" to the admin login (that locked other users out),
 * and admin logout asks for confirmation.
 */

const SECRET = process.env.JWT_SECRET || 'e2e_secret_key';
const ADMIN_ID = '6a7d56c980a151d5ad8b17d0';
const adminJwt = (expiresIn = '1h') => jwt.sign({ id: ADMIN_ID, role: 'Admin', phone: '0000000000' }, SECRET, { expiresIn });
const expiredAdminJwt = () => jwt.sign({ id: ADMIN_ID, role: 'Admin', phone: '0000000000', exp: Math.floor(Date.now() / 1000) - 3600 }, SECRET);

const seed = (page, items) => page.evaluate((kv) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
}, items);

test.describe('Site root goes to the customer app', () => {
    test('signed out -> customer login', async ({ page }) => {
        await page.goto('/user/auth', { waitUntil: 'commit' });
        await seed(page, {});
        await page.goto('/');
        await expect(page).toHaveURL(/\/user\/auth$/);
    });

    test('leftover admin session (the reported bug) -> customer login, not admin login', async ({ page }) => {
        await page.goto('/user/auth', { waitUntil: 'commit' });
        // What an admin login leaves behind after the admin session has lapsed
        await seed(page, { token: adminJwt(), userRole: 'admin', user: JSON.stringify({ _id: ADMIN_ID, role: 'Admin' }) });
        await page.goto('/');
        await expect(page).toHaveURL(/\/user\/auth$/);
        await expect(page.getByText('Admin Login')).toHaveCount(0);
    });

    test('expired admin session is cleaned up by the admin guard', async ({ page }) => {
        await page.goto('/user/auth', { waitUntil: 'commit' });
        await seed(page, { adminAuth: 'true', adminToken: expiredAdminJwt(), adminData: JSON.stringify({ role: 'Admin' }), token: expiredAdminJwt(), userRole: 'admin' });
        await page.goto('/admin/dashboard');
        await expect(page).toHaveURL(/\/admin\/login/);
        const leftovers = await page.evaluate(() => ['token', 'userRole', 'adminToken'].filter(k => localStorage.getItem(k)));
        expect(leftovers).toEqual([]);
        await page.goto('/');
        await expect(page).toHaveURL(/\/user\/auth$/);
    });

    test('signed-in customer -> customer home', async ({ page, request }) => {
        const phone = `7${String(Date.now()).slice(-9)}`;
        const api = process.env.E2E_API_URL || 'http://127.0.0.1:5099/api';
        await request.post(`${api}/auth/request-otp`, { data: { phone, role: 'Customer', channel: 'SMS' } });
        const session = await (await request.post(`${api}/auth/verify-otp`, { data: { phone, otp: '123456' } })).json();

        await page.goto('/user/auth', { waitUntil: 'commit' });
        await seed(page, {
            token: session.token, userRole: 'customer',
            user: JSON.stringify({ ...session.user, displayName: 'E2E', address: 'x', isProfileComplete: true })
        });
        await page.goto('/');
        await expect(page).toHaveURL(/\/user\/home$/);
    });
});

test.describe('Admin logout asks for confirmation', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1400, height: 900 });
        await page.goto('/admin/login');
        await seed(page, {
            adminAuth: 'true', adminToken: adminJwt(), adminData: JSON.stringify({ _id: ADMIN_ID, role: 'Admin' }),
            token: adminJwt(), userRole: 'admin'
        });
        await page.goto('/admin/dashboard');
        await page.waitForLoadState('networkidle');
    });

    const logoutButton = (page) => page.locator('aside').getByRole('button', { name: /logout/i });

    test('cancel and Escape keep the admin signed in', async ({ page }) => {
        await logoutButton(page).click();
        const dialog = page.getByRole('alertdialog', { name: 'Log out of the admin panel?' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/\/admin\/dashboard/);

        await logoutButton(page).click();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        expect(await page.evaluate(() => localStorage.getItem('adminToken'))).toBeTruthy();
    });

    test('confirming logs out and clears the session', async ({ page }) => {
        await logoutButton(page).click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'Log out' }).click();
        await expect(page).toHaveURL(/\/admin\/login/);
        expect(await page.evaluate(() => localStorage.length)).toBe(0);

        // And the site root now goes to the customer login
        await page.goto('/');
        await expect(page).toHaveURL(/\/user\/auth$/);
    });
});
