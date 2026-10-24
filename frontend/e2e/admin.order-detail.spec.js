import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { scopedAnalytics } from '../src/test/fixtures/adminAnalytics.js';

// Read-only UI acceptance. All API responses are test-owned fixtures.
const order = {
    _id: '6a7d56c980a151d5ad8b1701', orderId: '#ON-101', status: 'PROCESSING',
    createdAt: '2026-10-20T08:00:00Z', customer: { _id: '6a7d56c980a151d5ad8b1702', displayName: 'Alice Customer', phone: '9876543210', email: 'alice@example.com', role: 'Customer', status: 'approved' },
    vendor: { _id: '6a7d56c980a151d5ad8b1703', displayName: 'Bob Owner', shopDetails: { name: 'Actual Laundry', address: 'Shop 12' } },
    dropAddress: 'Actual delivery address', items: [{ name: 'Actual service', quantity: 2, price: 100, unit: 'kg' }],
    totalAmount: 318.6, advanceAmount: 15, dueAmount: 303.6, paymentStatus: 'Pending', paymentMethod: 'COD',
    priceBreakdown: { baseWithArea: 200, platformFee: 20, logisticsFee: 50, gstAmount: 48.6 },
    statusHistory: [{ status: 'ORDER_PLACED', timestamp: '2026-10-20T08:00:00Z' }, { status: 'PROCESSING', timestamp: '2026-10-20T09:00:00Z' }]
};

const clickAdminNavigation = async (page, label) => {
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('button', { name: label, exact: true }).click();
};

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('adminAuth', 'true');
        localStorage.setItem('adminToken', `test.${btoa(JSON.stringify({ role: 'Admin', exp: 9999999999 }))}.test`);
        localStorage.setItem('adminData', JSON.stringify({ role: 'Admin', displayName: 'Order QA' }));
    });
    await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let body = {};
        if (path.endsWith('/admin/dashboard-analytics')) body = scopedAnalytics;
        else if (path.endsWith('/admin/dashboard-analytics/filters')) body = { success: true, scope: scopedAnalytics.scope, data: { states: [], stateCityMap: {}, cityPincodeMap: {}, geofenceMap: {} } };
        else if (path.endsWith('/admin/sidebar-counts')) body = { supportTickets: 1, disputes: 1 };
        else if (path.endsWith('/admin/audit-events')) body = { data: [{ _id: 'audit-1', operationId: 'operation-123', actorId: 'admin-1', method: 'PATCH', path: '/api/admin/users/customer-1/toggle-status', outcome: 'Succeeded', statusCode: 200, createdAt: '2026-10-23T12:00:00Z', before: { status: 'approved' }, after: { status: 'rejected', isBlocked: true } }], pagination: { page: 1, total: 1, totalPages: 1 }, visibility: 'own' };
        else if (path.includes('/admin/users/') && path.endsWith('/history')) {
            const section = new URL(route.request().url()).searchParams.get('section');
            body = { user: order.customer, section: section || 'orders', data: section === 'tickets' ? [{ _id: 'ticket-1', subject: 'Recorded assistance', category: 'Others', status: 'Open', createdAt: order.createdAt }] : [order], pagination: { page: 1, total: 1, totalPages: 1 } };
        } else if (path.endsWith('/tickets/ticket-1')) body = { _id: 'ticket-1', subject: 'Recorded assistance', description: 'Recorded description', category: 'Others', status: 'Open', messages: [{ _id: 'message-1', senderRole: 'Admin', message: 'Recorded support response', createdAt: order.createdAt }] };
        else if (path.endsWith('/admin/config')) body = [{ key: 'invoice_settings', value: { businessName: 'Actual Business', showLogo: false, showTaxes: true } }];
        else if (path.includes('/admin/orders/')) {
            const last = path.split('/').at(-1);
            if (last === 'missing') { await route.fulfill({ status: 404, json: { message: 'Order not found.' } }); return; }
            body = order;
        } else if (path.endsWith('/orders/all')) body = { data: [order], pagination: { page: 1, total: 1, totalPages: 1 }, filterOptions: { customerNames: ['Alice Customer'], serviceZones: [] } };
        else if (path.endsWith('/admin/users')) body = [order.customer, { _id: 'other', displayName: 'Different Customer', phone: '1111111111', email: 'other@example.com', role: 'Customer', status: 'approved' }];
        else if (path.endsWith('/master-services') || path.endsWith('/geofence/areas') || path.endsWith('/supplier-service-zones')) body = [];
        await route.fulfill({ json: body });
    });
});

test('order list opens the real detail and recorded invoice without mutation requests', async ({ page, context }) => {
    await context.addInitScript(() => { window.print = () => { window.__printRequested = true; }; });
    const errors = [];
    const writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/') && !['GET', 'OPTIONS'].includes(request.method())) writes.push(request.url()); });
    await page.goto('/admin/orders');
    await page.getByRole('button', { name: 'View order #ON-101', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${order._id}`));
    await expect(page.getByText('Alice Customer', { exact: true })).toBeVisible();
    await expect(page.getByText('Actual delivery address', { exact: true })).toBeVisible();
    await expect(page.getByText('₹318.60', { exact: true })).toBeVisible();
    await expect(page.getByText('Julian Mendoza', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Download Invoice', exact: true }).click();
    const invoice = page.locator('#invoice-content');
    await expect(invoice).toContainText('Alice Customer');
    await expect(invoice).toContainText('Not issued');
    await expect(invoice).toContainText('₹100.00');
    await expect(invoice).toContainText('₹200.00');
    await expect(invoice).toContainText('₹318.60');
    await expect(invoice).not.toContainText('Promotional Discount');
    const popupEvent = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Print / Save PDF', exact: true }).click();
    const popup = await popupEvent;
    await expect(popup.locator('#invoice-content')).toContainText('Alice Customer');
    await expect(popup.locator('#invoice-content')).toContainText('₹318.60');
    await expect.poll(() => popup.evaluate(() => Boolean(window.__printRequested))).toBe(true);
    await expect(popup.locator('#invoice-content')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await popup.close();
    await page.getByRole('button', { name: 'Close invoice' }).click();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
});

test('customer link and email search filter the full user list before pagination', async ({ page }) => {
    await page.goto(`/admin/orders/${order._id}`);
    await page.getByRole('button', { name: 'View User Profile', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search users' })).toHaveValue('9876543210');
    await expect(page.getByText('Alice Customer', { exact: true })).toBeVisible();
    await expect(page.getByText('Different Customer', { exact: true })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search users' }).fill('OTHER@EXAMPLE');
    await expect(page.getByText('Different Customer', { exact: true })).toBeVisible();
    await expect(page.getByText('Alice Customer', { exact: true })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search users' }).clear();
    await expect(page.getByText('Alice Customer', { exact: true })).toBeVisible();
    await expect(page.getByText('Different Customer', { exact: true })).toBeVisible();
});

test('missing order cannot fall back to an invoice or a sample customer', async ({ page }) => {
    await page.goto('/admin/orders/missing');
    await expect(page.getByRole('alert')).toContainText('Order not found');
    await expect(page.getByRole('button', { name: 'Download Invoice', exact: true })).toHaveCount(0);
    await expect(page.getByText('Julian Mendoza', { exact: true })).toHaveCount(0);
});

for (const tab of ['Active', 'Completed']) {
    test(`${tab} orders end with customer and vendor PDF downloads`, async ({ page }) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('/admin/orders');
        await clickAdminNavigation(page, `${tab} Orders`);
        await expect(page.getByRole('columnheader').last()).toHaveText('Invoices');
        for (const party of ['customer', 'vendor']) {
            const downloaded = page.waitForEvent('download');
            await page.getByRole('button', { name: `Download ${party} invoice`, exact: true }).click();
            const download = await downloaded;
            expect(download.suggestedFilename()).toMatch(/Invoice_.*\.pdf$/);
            expect((await readFile(await download.path())).subarray(0, 5).toString()).toBe('%PDF-');
        }
        expect(errors).toEqual([]);
    });
}


test('audit history opens from the sidebar with safe state details and checkbox filters', async ({ page }) => {
    const errors = []; const writes = []; const queries = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
        if (request.url().includes('/api/') && !['GET', 'OPTIONS'].includes(request.method())) writes.push(request.url());
        if (request.url().includes('/admin/audit-events')) queries.push(new URL(request.url()).searchParams);
    });
    await page.goto('/admin/orders');
    await clickAdminNavigation(page, 'Audit History');
    await expect(page).toHaveURL(/\/admin\/audit-history$/);
    await expect(page.getByRole('heading', { name: 'Audit History' })).toBeVisible();
    await expect(page.getByText('Succeeded (200)', { exact: true })).toBeVisible();
    await expect(page.getByText('Showing your own audit history within your admin permissions.')).toBeVisible();
    await page.getByText('View details', { exact: true }).click();
    await expect(page.getByText('operation-123', { exact: true })).toBeVisible();
    await expect(page.getByText('{"status":"rejected","isBlocked":true}', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Audit outcome', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Denied', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Failed', exact: true }).click();
    await expect.poll(() => JSON.parse(queries.at(-1)?.get('outcome') || '[]')).toEqual(['Denied', 'Failed']);
    expect(writes).toEqual([]); expect(errors).toEqual([]);
});


test('user history links real orders and reads recorded support without writes', async ({ page }) => {
    const errors = []; const writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/') && !['GET', 'OPTIONS'].includes(request.method())) writes.push(request.url()); });
    await page.goto('/admin/users');
    await page.getByRole('link', { name: 'View history for Alice Customer' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/users/${order.customer._id}/history`));
    await expect(page.getByText('Alice Customer', { exact: true })).toBeVisible();
    await expect(page.getByText('₹318.60', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'View order', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${order._id}`));
    await page.goBack();
    await page.getByRole('button', { name: 'Support history' }).click();
    await page.getByRole('button', { name: 'Read conversation' }).click();
    await expect(page.getByText('Recorded support response', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close conversation' }).click();
    await expect(page.getByText('Recorded support response', { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]); expect(writes).toEqual([]);
});


test('dashboard permission errors retry into visibly scoped metrics without writes', async ({ page }) => {
    const errors = []; const writes = []; let allowReport = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/') && !['GET', 'OPTIONS'].includes(request.method())) writes.push(request.url()); });
    await page.route('**/api/admin/dashboard-analytics*', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/filters')) return route.fallback();
        if (!allowReport) return route.fulfill({ status: 403, json: { message: 'Report scope could not be verified' } });
        return route.fulfill({ json: scopedAnalytics });
    });
    await page.goto('/admin/dashboard');
    await expect(page.getByRole('alert')).toContainText('Report scope could not be verified');
    allowReport = true;
    await page.getByRole('button', { name: 'Retry dashboard' }).click();
    await expect(page.getByText(/Accounts, orders and support reflect your assigned service areas/)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]); expect(writes).toEqual([]);
});

test('customer invoice issuance freezes the preview from the returned record', async ({ page }) => {
    let issued = null;
    await page.route('**/api/admin/orders/*/invoices', async route => {
        expect(route.request().method()).toBe('POST');
        issued = { number: 'INV-2026-100001', issuedAt: '2026-10-24T01:00:00Z', facts: { ...order, totalAmount: 318.6 }, settings: { businessName: 'Frozen Issuer', showLogo: false } };
        await route.fulfill({ status: 201, json: issued });
    });
    await page.goto(`/admin/orders/${order._id}`);
    await page.getByRole('button', { name: 'Download Invoice', exact: true }).click();
    await page.getByRole('button', { name: 'Issue customer invoice', exact: true }).click();
    await expect(page.locator('#invoice-content')).toContainText('INV-2026-100001');
    await expect(page.locator('#invoice-content')).toContainText('Frozen Issuer');
    expect(issued.facts.totalAmount).toBe(318.6);
});

test('removed admin sections stay absent and old URLs redirect to the dashboard', async ({ page }) => {
    await page.goto('/admin/dashboard');
    for (const label of ['Health & SLA', 'Reports & Reconciliation', 'Vendor Ranking']) await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    for (const path of ['operations', 'reports', 'vendor-ranking']) {
        await page.goto(`/admin/${path}`);
        await expect(page).toHaveURL(/\/admin\/dashboard$/);
        await expect(page.getByText(/Accounts, orders and support reflect/)).toBeVisible();
    }
});

test('new admin modal searches and retains multiple geofence restrictions', async ({ page }) => {
    await page.route('**/api/admin/sub-admins', route => route.fulfill({ json: [] }));
    await page.route('**/api/geofence/areas', route => route.fulfill({ json: Array.from({ length: 80 }, (_, index) => ({ _id: `zone-${index}`, areaName: `Location ${String(index + 1).padStart(2, '0')}` })) }));
    await page.goto('/admin/users/roles');
    await page.getByRole('button', { name: 'Create New Admin' }).click();
    const trigger = page.getByRole('button', { name: 'Geofence restrictions' });
    await expect(page.getByRole('checkbox', { name: 'Location 01', exact: true })).toHaveCount(0);
    await trigger.click();
    const search = page.getByRole('searchbox', { name: 'Search Geofence restrictions' });
    await search.fill('Location 01'); await page.getByRole('checkbox', { name: 'Location 01', exact: true }).check();
    await search.fill('Location 80'); await page.getByRole('checkbox', { name: 'Location 80', exact: true }).check();
    await search.clear(); await expect(page.getByRole('checkbox', { name: 'Location 01', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Location 80', exact: true })).toBeChecked();
    await page.screenshot({ path: test.info().outputPath('role-geofence-dropdown.png'), fullPage: true });
    await search.press('Escape'); await expect(trigger).toContainText('(2)'); await expect(trigger).toBeFocused();
    await trigger.click(); await page.getByRole('checkbox', { name: 'All locations (no restrictions)', exact: true }).check();
    await page.getByRole('searchbox', { name: 'Search Geofence restrictions' }).press('Escape');
    await expect(trigger).toContainText('All locations (no restrictions)');
});

test('operational dashboard retains selected filters during automatic refresh and links overdue orders', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1050 });
    const errors = []; const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        const set = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
        window.__dashboardTimers = new Map();
        window.setInterval = (callback, ms, ...args) => { const id = set(callback, ms, ...args); if (ms === 60000) window.__dashboardTimers.set(id, callback); return id; };
        window.clearInterval = id => { window.__dashboardTimers.delete(id); clear(id); };
    });
    await page.route('**/api/admin/dashboard-analytics*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/filters')) return route.fallback();
        const channel = url.searchParams.get('channel');
        requests.push(channel);
        const b2c = channel === 'B2C';
        await route.fulfill({ json: { ...scopedAnalytics, data: { ...scopedAnalytics.data,
            ...(b2c ? { supplierOverview: { available: false }, financialOverview: { ...scopedAnalytics.data.financialOverview, supplyPendingValue: 0 }, transactions: { total: 667, customerValue: 667, supplyValue: 0, customerOrders: 4, supplyOrders: 0 }, partnersAndClients: { ...scopedAnalytics.data.partnersAndClients, total: 13, suppliers: 0, supplierTypes: [] }, activeOrders: { total: 4, b2c: 4, b2b: 0 }, gmv: { ...scopedAnalytics.data.gmv, selectedPeriod: 667 }, charts: { activeStages: scopedAnalytics.data.charts.activeStages.map(stage => ({ ...stage, b2b: 0 })), gmvTrend: { ...scopedAnalytics.data.charts.gmvTrend, points: scopedAnalytics.data.charts.gmvTrend.points.map((point, i) => ({ ...point, amount: [78, 131, 96, 74, 87, 43, 158][i] })) } } } : {}),
            orderTimeline: { ...scopedAnalytics.data.orderTimeline, items: scopedAnalytics.data.orderTimeline.items.map(event => event.orderNumber === order.orderId ? { ...event, orderId: order._id } : event) },
            delayedPickups: { total: 1, page: 1, pages: 1, items: [{ key: 'overdue', orderId: order._id, orderNumber: order.orderId, dueAt: '2026-10-24T01:00:00Z', overdueHours: 3.5 }] }
        } } });
    });
    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { name: 'Active orders', exact: true })).toBeVisible();
    await page.getByLabel('Channel', { exact: true }).selectOption('B2C');
    await expect(page.getByRole('heading', { name: 'Active orders', exact: true })).toBeVisible();
    const poll = page.waitForRequest(request => request.url().includes('/admin/dashboard-analytics?') && new URL(request.url()).searchParams.get('channel') === 'B2C');
    await page.evaluate(() => [...window.__dashboardTimers.values()].forEach(callback => callback()));
    await poll;
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
    expect(requests.at(-1)).toBe('B2C');
    await expect(page.getByRole('heading', { name: 'Delayed pickups · over 2 hours', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: order.orderId, exact: true }).first()).toHaveAttribute('href', `/admin/orders/${order._id}`);
    for (const text of ['Financial Intel', 'Partners & Clients', 'Catalogs & Support', 'Vendor Ranking']) await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Gross Merchandise Value trend', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active order breakdown', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Gross Merchandise Value trend chart' }).locator('svg.recharts-surface')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Active order breakdown chart' }).locator('svg.recharts-surface')).toBeVisible();
    for (const name of ['Financial overview', 'Combined transaction value', 'Partners and clients', 'Order timeline']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('operational-dashboard.png'), fullPage: true });
    await page.getByRole('region', { name: 'Partners and clients', exact: true }).screenshot({ path: test.info().outputPath('partners-and-clients.png') });
    await page.getByRole('region', { name: 'Order timeline', exact: true }).screenshot({ path: test.info().outputPath('order-timeline.png') });
    await page.getByRole('region', { name: 'Financial overview', exact: true }).screenshot({ path: test.info().outputPath('financial-overview.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => { const box = await page.locator('aside').boundingBox(); return Math.round(box.x + box.width); }).toBeLessThanOrEqual(0);
    await expect.poll(async () => (await page.locator('main').boundingBox()).width).toBeGreaterThan(380);
    await expect(page.getByRole('heading', { name: 'Gross Merchandise Value trend', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('operational-dashboard-mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
});

test('vendor registration lists include proprietors and partnerships and reset pagination between categories', async ({ page }) => {
    const vendors = [
        { _id: 'proprietor', displayName: 'Registered Proprietor', businessType: 'Proprietorship' },
        { _id: 'partnership', displayName: 'Registered Partnership', businessType: 'Partnership' },
        { _id: 'gst-legacy', displayName: 'Legacy Registered Vendor', shopDetails: { gst: '27ABCDE1234F1Z5' } },
        ...Array.from({ length: 9 }, (_, i) => ({ _id: `company-${i}`, displayName: `Company ${i}`, businessType: i % 2 ? 'Franchise' : 'Pvt Ltd' })),
        { _id: 'local', displayName: 'Local Shop', businessType: 'Unregistered/Local' },
        { _id: 'legacy-local', displayName: 'Legacy Local Shop', businessType: '', gstNumber: '' }
    ].map((vendor, i) => ({ phone: `98990000${String(i).padStart(2, '0')}`, role: 'Vendor', status: 'approved', shopDetails: { name: `Facility ${i}` }, ...vendor }));
    await page.route('**/api/admin/users?*', route => route.fulfill({ json: vendors }));
    await page.goto('/admin/users?role=Vendor&vendorType=registered');
    for (const name of ['Registered Proprietor', 'Registered Partnership', 'Legacy Registered Vendor']) await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByText('Local Shop', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Company 8', { exact: true })).toBeVisible();
    await clickAdminNavigation(page, 'Unregistered Vendors');
    await expect(page).toHaveURL(/vendorType=unregistered/);
    await expect(page.getByText('Local Shop', { exact: true })).toBeVisible();
    await expect(page.getByText('Legacy Local Shop', { exact: true })).toBeVisible();
    await expect(page.getByText('Registered Proprietor', { exact: true })).toHaveCount(0);
    await clickAdminNavigation(page, 'Registered Vendors');
    await expect(page.getByText('Registered Proprietor', { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('registered-vendors.png'), fullPage: true });
});


test('dashboard supplier analytics show real supplier summaries and explain customer-only filtering', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.route('**/api/admin/dashboard-analytics*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/filters')) return route.fallback();
        await route.fulfill({ json: { ...scopedAnalytics, data: { ...scopedAnalytics.data, ...(url.searchParams.get('channel') === 'B2C' ? { supplierOverview: { available: false } } : {}) } } });
    });
    await page.goto('/admin/dashboard');
    const panel = page.getByRole('region', { name: 'Supplier overview', exact: true });
    await expect(panel.getByRole('heading', { name: 'Supply-order value', exact: true })).toBeVisible();
    await expect(panel.getByText('Actual Wholesale Supplier', { exact: true })).toBeVisible();
    await expect(panel.getByText('Regional Distributor', { exact: true })).toBeVisible();
    await expect(panel.locator('svg.recharts-surface')).toBeVisible();
    await expect(panel.getByRole('link', { name: 'View suppliers →' })).toHaveAttribute('href', '/admin/users?role=Supplier');
    await panel.screenshot({ path: test.info().outputPath('supplier-overview.png') });
    await page.getByLabel('Channel', { exact: true }).selectOption('B2C');
    await expect(panel.getByText(/Supplier analytics are hidden/)).toBeVisible();
    await expect(panel.getByText('Actual Wholesale Supplier', { exact: true })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Show supplier analytics', exact: true }).click();
    await expect(page.getByLabel('Channel', { exact: true })).toHaveValue('All');
    await expect(panel.getByText('Actual Wholesale Supplier', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => { const box = await page.locator('aside').boundingBox(); return Math.round(box.x + box.width); }).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});


test('promotion bulk preview counts valid and invalid rows without a render error', async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/promotions/admin/all', route => route.fulfill({ json: [] }));
    await page.goto('/admin/promotion-table');
    await page.getByRole('button', { name: 'Bulk Upload', exact: true }).click();
    await page.locator('#bulk-file-input').setInputFiles({ name: 'promotions.csv', mimeType: 'text/csv', buffer: Buffer.from('code,discountType,discountValue,expiryDate\nREADY10,Percentage,10,2027-01-01\n,Percentage,10,2027-01-01\n') });
    await expect(page.getByText(/1 valid/, { exact: false })).toBeVisible();
    await expect(page.getByText(/1 invalid/, { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: /Upload \(1 rows\)/ })).toBeEnabled();
    expect(errors).toEqual([]);
});

test('supply product bulk preview resolves the spreadsheet subcategory', async ({ page }) => {
    await page.route('**/api/vendor-supply-categories*', route => route.fulfill({ json: [{ _id: '600000000000000000000001', mainCategory: 'Cleaning', subCategory: 'Detergent' }] }));
    await page.route('**/api/vendor-master-supplies*', route => route.fulfill({ json: { data: [], pagination: { page: 1, total: 0, totalPages: 1 } } }));
    await page.goto('/admin/vendor-supply-pricing/products');
    await page.getByRole('button', { name: 'Bulk Upload', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'supplies.csv', mimeType: 'text/csv', buffer: Buffer.from('materialName,mainCategory,subCategory,wholesaleRate\nDetergent Pack,Cleaning,Detergent,100\n') });
    await expect(page.getByText('Detergent Pack', { exact: true })).toBeVisible();
    await expect(page.getByText(/Could not parse the file/)).toHaveCount(0);
});

test('publishing a media kit refreshes upload history without a false failure', async ({ page }) => {
    let uploaded = false;
    await page.route('**/api/media/history', route => route.fulfill({ json: uploaded ? [{ _id: 'media-one', fileName: 'release-media.pdf', fileUrl: '/uploads/release-media.pdf', uploadedAt: '2026-10-24T01:00:00Z' }] : [] }));
    await page.route('**/api/media/inquiries*', route => route.fulfill({ json: [] }));
    await page.route('**/api/media/upload', async route => { uploaded = true; await route.fulfill({ json: { success: true } }); });
    await page.goto('/admin/media');
    await page.locator('#media-upload').setInputFiles({ name: 'release-media.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nfixture') });
    await page.getByRole('button', { name: 'Publish Media Kit', exact: true }).click();
    await expect(page.getByText('release-media.pdf', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Upload failed', { exact: true })).toHaveCount(0);
});


test('a rejected media upload stays failed without a publish success message', async ({ page }) => {
    await page.route('**/api/media/history', route => route.fulfill({ json: [] }));
    await page.route('**/api/media/inquiries*', route => route.fulfill({ json: [] }));
    await page.route('**/api/media/upload', route => route.fulfill({ status: 503, json: { success: false, message: 'Media storage unavailable' } }));
    await page.goto('/admin/media');
    await page.locator('#media-upload').setInputFiles({ name: 'release-media.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nfixture') });
    await page.getByRole('button', { name: 'Publish Media Kit', exact: true }).click();
    await expect(page.getByText('Media storage unavailable', { exact: true })).toBeVisible();
    await expect(page.getByText('Media Kit uploaded successfully!', { exact: true })).toHaveCount(0);
});
