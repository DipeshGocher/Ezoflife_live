import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import { readFileSync, existsSync } from 'node:fs';
import { MAIL_OUTBOX } from './stack.js';

/**
 * Sub-admin invitation journey in the browser: a master admin adds a role,
 * the invitee is locked out until they accept the emailed link, the invite
 * page can't be refreshed, and after accepting they log in with phone + OTP
 * and only see the modules their role grants.
 */

const SECRET = process.env.JWT_SECRET || 'e2e_secret_key';
const MASTER_ID = '6a7d56c980a151d5ad8b17d0';
const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:5099/api';

const stamp = Date.now().toString().slice(-6);
const INVITEE = {
    first: 'Esha', last: 'Kapoor',
    email: `esha.${stamp}@example.com`,
    phone: `98${stamp}11`.slice(0, 10),
    role: 'Customer Support Executive'
};

test.describe.configure({ mode: 'serial' });

const signInAsMaster = async (page) => {
    const token = jwt.sign({ id: MASTER_ID, role: 'Admin', phone: '0000000000' }, SECRET, { expiresIn: '1h' });
    await page.goto('/admin/login');
    await page.evaluate(({ token, id }) => {
        localStorage.setItem('adminAuth', 'true');
        localStorage.setItem('adminToken', token);
        localStorage.setItem('adminData', JSON.stringify({ _id: id, role: 'Admin', displayName: 'E2E Master' }));
    }, { token, id: MASTER_ID });
};

/** Latest invite link emailed to `email`, rebased onto the test web server. */
const inviteLinkFor = (email, baseURL) => {
    const mails = existsSync(MAIL_OUTBOX)
        ? readFileSync(MAIL_OUTBOX, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
        : [];
    const mail = mails.filter(m => m.to === email).at(-1);
    if (!mail) return null;
    const url = new URL(mail.text.match(/https?:\/\/\S+accept-invite\?token=[a-f0-9]{64}/)[0]);
    return `${baseURL}${url.pathname}${url.search}`;
};

const fillOtp = async (page, code = '123456') => {
    const boxes = page.locator('input[maxlength="1"]');
    await expect(boxes.first()).toBeVisible();
    for (let i = 0; i < code.length; i++) await boxes.nth(i).fill(code[i]);
};

const loginWithPhone = async (page, phone) => {
    await page.goto('/admin/login');
    await page.locator('input[type="tel"]').first().fill(phone);
};

test('a master admin invites someone to a role', async ({ page, baseURL }) => {
    await signInAsMaster(page);
    await page.goto('/admin/users/roles');

    await page.getByRole('button', { name: /add new role/i }).click();
    await page.getByPlaceholder('e.g. John').fill(INVITEE.first);
    await page.getByPlaceholder('e.g. Doe').fill(INVITEE.last);
    await page.getByPlaceholder('john.doe@company.com').fill(INVITEE.email);
    await page.getByPlaceholder('9999999999').fill(INVITEE.phone);
    await page.locator('form select').first().selectOption(INVITEE.role);
    await expect(page.getByText('Support Tickets', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /generate invitation/i }).click();

    await expect(page.getByText(`Invitation sent to ${INVITEE.email}`)).toBeVisible();
    const row = page.locator('tr', { hasText: INVITEE.email });
    await expect(row.getByText('Invite Pending')).toBeVisible();
    await expect(row.getByRole('button', { name: /resend invite/i })).toBeVisible();
    expect(inviteLinkFor(INVITEE.email, baseURL)).toBeTruthy();
});

test('the invitee cannot log in before accepting', async ({ page }) => {
    await loginWithPhone(page, INVITEE.phone);
    await expect(page.getByText(/accept the invitation sent to your email/i).first()).toBeVisible();
    expect(page.url()).toContain('/admin/login');
});

test('resend replaces the link', async ({ page, baseURL }) => {
    const before = inviteLinkFor(INVITEE.email, baseURL);
    await signInAsMaster(page);
    await page.goto('/admin/users/roles');
    const row = page.locator('tr', { hasText: INVITEE.email });
    await row.getByRole('button', { name: /resend invite/i }).click();
    await expect(page.getByText(`Invitation re-sent to ${INVITEE.email}`)).toBeVisible();

    const after = inviteLinkFor(INVITEE.email, baseURL);
    expect(after).not.toBe(before);

    await page.goto(before);
    await expect(page.getByText('Invitation unavailable')).toBeVisible();
});

test('the invite page cannot be refreshed, and accepting works once', async ({ page, baseURL }) => {
    const link = inviteLinkFor(INVITEE.email, baseURL);

    await page.goto(link);
    await expect(page.getByText("You're invited")).toBeVisible();
    await expect(page.getByText(INVITEE.role).first()).toBeVisible();
    expect(page.url()).not.toContain('token=');

    await page.reload();
    await expect(page.getByText('Invitation unavailable')).toBeVisible();

    // Opening the emailed link again works until it is accepted
    await page.goto(link);
    await page.getByRole('button', { name: /accept invitation/i }).click();
    await expect(page.getByText('Invitation accepted')).toBeVisible();

    await page.goto(link);
    await expect(page.getByText('Already accepted')).toBeVisible();
});

test('the directory shows the invite as accepted', async ({ page }) => {
    await signInAsMaster(page);
    await page.goto('/admin/users/roles');
    const row = page.locator('tr', { hasText: INVITEE.email });
    await expect(row.getByText('Accepted', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: /resend invite/i })).toHaveCount(0);
});

test('after accepting, the invitee logs in and only reaches their modules', async ({ page }) => {
    await loginWithPhone(page, INVITEE.phone);
    await page.waitForURL(/\/admin\/otp/, { timeout: 25_000 });
    await fillOtp(page);

    // No Dashboard permission: lands on the first module they have
    await page.waitForURL(/\/admin\/users(\?|$)/, { timeout: 30_000 });

    const sidebar = page.locator('aside, nav').first();
    await expect(sidebar.getByText('Support Tickets', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Payments', { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText('User Role', { exact: true })).toHaveCount(0);

    // Typing a URL outside their role does not get them in
    await page.goto('/admin/payments?tab=customer');
    await page.waitForURL(/\/admin\/users(\?|$)/);
    await page.goto('/admin/users/roles');
    await page.waitForURL(/\/admin\/users(\?|$)/);

    // ...and the API refuses it as well
    const token = await page.evaluate(() => localStorage.getItem('adminToken'));
    const denied = await page.request.get(`${API_URL}/admin/customer-payments`, { headers: { Authorization: `Bearer ${token}` } });
    expect(denied.status()).toBe(403);
    const allowed = await page.request.get(`${API_URL}/orders/all`, { headers: { Authorization: `Bearer ${token}` } });
    expect(allowed.status()).toBe(200);
});
