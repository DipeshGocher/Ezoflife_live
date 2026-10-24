import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import process from 'node:process';
import { Buffer } from 'node:buffer';

/**
 * Splash ad, end to end: an admin-uploaded image is shown full-screen when an
 * app is opened, before the login page, for the configured duration, and only
 * once per browser session.
 */

const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:5099/api';
const adminToken = () => jwt.sign(
    { id: '6a7d56c980a151d5ad8b17d0', role: 'Admin', phone: '0000000000' },
    process.env.JWT_SECRET || 'e2e_secret_key',
    { expiresIn: '1h' }
);
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const createdIds = [];
const createSplash = async (request, { seconds, audience = 'all', title, notes = '' }) => {
    const res = await request.post(`${API_URL}/ads`, {
        headers: { Authorization: `Bearer ${adminToken()}` },
        multipart: {
            title, notes, type: 'image', category: 'splash', durationSeconds: String(seconds), audience,
            media: { name: 'splash.png', mimeType: 'image/png', buffer: PNG }
        }
    });
    expect(res.status(), await res.text()).toBe(201);
    const ad = await res.json();
    createdIds.push(ad._id);
    return ad;
};

const removeAll = async (request) => {
    for (const id of createdIds.splice(0)) {
        await request.delete(`${API_URL}/ads/${id}`, { headers: { Authorization: `Bearer ${adminToken()}` } });
    }
};

test.describe.configure({ mode: 'serial' });

test.describe('Splash ad', () => {
    // A live splash would cover every other spec's pages: always remove it.
    test.afterAll(async ({ request }) => { await removeAll(request); });

    test('shows before the login page for the configured time, then once per session', async ({ page, request }) => {
        await createSplash(request, { seconds: 3, title: 'E2E Monsoon Sale', notes: 'Flat 20% off on dry cleaning' });

        const start = Date.now();
        // The splash shows while the app is still loading underneath, so don't
        // wait for the full load event before looking for it.
        await page.goto('/user/auth', { waitUntil: 'commit' });
        const splash = page.getByTestId('splash-ad');
        await expect(splash).toBeVisible();
        await expect(page.getByAltText('E2E Monsoon Sale')).toBeVisible();
        // Title and notes appear on the splash itself
        await expect(page.getByTestId('splash-caption').getByText('E2E Monsoon Sale')).toBeVisible();
        await expect(page.getByTestId('splash-caption').getByText('Flat 20% off on dry cleaning')).toBeVisible();

        // Covers the login page while showing, then gets out of the way
        await expect(splash).toBeHidden({ timeout: 8000 });
        const shownFor = Date.now() - start;
        expect(shownFor, 'splash hid too early').toBeGreaterThanOrEqual(3000);
        await expect(page.locator('input[type="tel"], input[type="number"]').first()).toBeVisible();

        // Reload in the same session: no splash
        await page.reload();
        await page.waitForLoadState('networkidle');
        await expect(page.getByTestId('splash-ad')).toHaveCount(0);
    });

    test('a new session (app reopened) shows it again, in every targeted app', async ({ browser }) => {
        for (const path of ['/user/auth', '/vendor/auth', '/supplier/auth']) {
            const context = await browser.newContext(); // fresh sessionStorage = app reopened
            const page = await context.newPage();
            await page.goto(path, { waitUntil: 'commit' });
            await expect(page.getByTestId('splash-ad'), `no splash on ${path}`).toBeVisible();
            await context.close();
        }
    });

    test('opening the app root goes splash -> login page', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto('/', { waitUntil: 'commit' });
        await expect(page.getByTestId('splash-ad')).toBeVisible();
        await expect(page.getByTestId('splash-ad')).toBeHidden({ timeout: 8000 });
        await expect(page).toHaveURL(/\/user\/auth/);
        await context.close();
    });

    test('no splash on the admin panel', async ({ page }) => {
        await page.goto('/admin/login');
        await page.waitForLoadState('networkidle');
        await expect(page.getByTestId('splash-ad')).toHaveCount(0);
    });

    test('with no live splash, the app opens straight to its page', async ({ browser, request }) => {
        await removeAll(request);
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto('/user/auth');
        await page.waitForLoadState('networkidle');
        await expect(page.getByTestId('splash-ad')).toHaveCount(0);
        await context.close();
    });
});
