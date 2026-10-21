// Real order APIs -> finalized invoices -> production renderers -> Chromium.
// Requires the frontend dependencies and an installed Playwright Chromium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import React from '../../../frontend/node_modules/react/index.js';
import { renderToStaticMarkup } from '../../../frontend/node_modules/react-dom/server.node.js';
import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { renderCustomerInvoiceHtml } from '../../../frontend/src/lib/customerInvoiceHtml.js';
import { api, startTestEnvironment, FIXTURE_SERVICE_ID } from '../helpers/testEnvironment.js';
import { asUser, createUser, makeVendorCapableOf, orderPayload } from '../helpers/factories.js';
import { GST_DEMO_ACCOUNTS } from '../helpers/gstAccounts.js';

test('finalized invoices display accurately for A, B, C, promotion, interstate and configurable taxes', { timeout: 120000 }, async () => {
    let env, vite, browser;
    const output = '/private/tmp/ezoflife-gst-invoice-display';
    mkdirSync(output, { recursive: true });
    try {
        env = await startTestEnvironment();
        const sessions = {};
        for (const [name, account] of Object.entries(GST_DEMO_ACCOUNTS)) {
            sessions[name] = await createUser(api, env.baseUrl, account.phone, account.role);
            assert.equal(sessions[name].status, 200);
            if (account.role === 'Vendor') await makeVendorCapableOf(env.mongoUri, sessions[name].id, [FIXTURE_SERVICE_ID]);
        }
        await mongoose.connect(env.mongoUri);
        const User = (await import('../../src/models/User.js')).default;
        const Order = (await import('../../src/models/Order.js')).default;
        for (const [name, account] of Object.entries(GST_DEMO_ACCOUNTS)) {
            const { shopDetails, ...rest } = account;
            const update = { ...rest };
            if (shopDetails) for (const [key, value] of Object.entries(shopDetails)) {
                if (key !== 'services') update[`shopDetails.${key}`] = value;
            }
            await User.updateOne({ _id: sessions[name].id }, { $set: update });
        }
        const db = mongoose.connection.db;
        await db.collection('masterservices').updateOne({ _id: new mongoose.Types.ObjectId(FIXTURE_SERVICE_ID) }, { $set: { gst: 18 } });
        await db.collection('systemconfigs').insertMany([{ key: 'platform_fee_multiplier', value: 0.1 }, { key: 'normal_logistics_fee', value: 50 }]);
        const call = (name, path, opts) => asUser(api, env.baseUrl, sessions[name].token)(path, opts);
        const frontendRoot = fileURLToPath(new URL('../../../frontend/', import.meta.url));
        vite = await createServer({ root: frontendRoot, server: { middlewareMode: true }, appType: 'custom' });
        const CustomerView = (await vite.ssrLoadModule('/src/modules/admin/components/InvoicePrint.jsx')).default;
        const PlatformView = (await vite.ssrLoadModule('/src/modules/vendor/components/PlatformRevenueInvoicePrint.jsx')).default;
        const css = readdirSync(`${frontendRoot}/dist/assets`).filter(file => file.endsWith('.css')).map(file => readFileSync(`${frontendRoot}/dist/assets/${file}`, 'utf8')).join('\n');
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1280, height: 1500 } });
        await page.route('http://invoice-test.local/**', route => route.fulfill(route.request().url().endsWith('/logo.png')
            ? { contentType: 'image/png', body: readFileSync(`${frontendRoot}/public/logo.png`) }
            : { contentType: 'text/html', body: '<html></html>' }));
        await page.goto('http://invoice-test.local');
        const promo = await (await import('../../src/models/Promotion.js')).default.create({
            title: 'Invoice display verification', code: 'DISPLAY100', owner_type: 'VENDOR', vendorId: sessions.rdVendor.id,
            scope_type: 'GLOBAL_ORDER', is_exclusive_window_eligible: true, discountType: 'Flat', discountValue: 100,
            minOrderValue: 0, approval_status: 'APPROVED', status: 'Active',
            start_date: new Date(Date.now() - 60000), expiryDate: new Date(Date.now() + 86400000)
        });
        // Disable until the dedicated promotion case.
        await promo.updateOne({ status: 'Inactive' });
        for (const [name, customer, vendor] of [
            ['A', 'rdCustomer', 'rdVendor'], ['B', 'urdCustomer', 'rdVendor'], ['C', 'urdCustomer', 'urdVendor'],
            ['promotion', 'rdCustomer', 'rdVendor'], ['interstate', 'rdCustomer', 'rdVendor'], ['configured-rates', 'rdCustomer', 'rdVendor']
        ]) {
            if (name === 'promotion') await promo.updateOne({ status: 'Active' });
            if (name === 'interstate') {
                await promo.updateOne({ status: 'Inactive' });
                await User.updateOne({ _id: sessions.rdVendor.id }, { $set: { 'shopDetails.gst': '29FGHIJ5678K1Z2', 'shopDetails.state': 'Karnataka' } });
            }
            if (name === 'configured-rates') {
                await promo.updateOne({ status: 'Inactive' });
                for (const [key, value] of [['gst_percent', 12], ['platform_fee_gst_percent', 7], ['logistics_fee_gst_percent', 9]]) {
                    await db.collection('systemconfigs').updateOne({ key }, { $set: { value } });
                }
                await db.collection('masterservices').updateOne({ _id: new mongoose.Types.ObjectId(FIXTURE_SERVICE_ID) }, { $set: { gst: 12 } });
            }
            const created = await call(customer, '/api/orders', { method: 'POST', body: orderPayload(sessions[customer].id) });
            assert.equal(created.status, 201, JSON.stringify(created.body));
            const accepted = await call(vendor, `/api/orders/vendor-accept/${created.body._id}`, { method: 'POST', body: {} });
            assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
            const delivered = await call(vendor, `/api/orders/status/${created.body._id}`, { method: 'PATCH', body: { status: 'DELIVERED' } });
            assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
            const order = JSON.parse(JSON.stringify(await Order.findById(created.body._id).populate('customer vendor').lean()));
            const c = order.invoices.customerInvoice, p = order.invoices.platformInvoice;
            assert.equal(c.documentStatus, 'FINALIZED');
            assert.equal(p.documentStatus, 'FINALIZED');
            assert.equal(c.totalAmount, name === 'configured-rates' ? 302.4 : 318.6);
            assert.equal(p.totalInvoiceAmount, name === 'promotion' ? 132.6 : name === 'configured-rates' ? 75.9 : 82.6);
            assert.equal(c.customerWalletCredit, name === 'promotion' ? 50 : 0);
            // Changing current profile objects must not change finalized identities.
            order.customer.displayName = 'CHANGED CUSTOMER';
            order.customer.gstNumber = '29ZZZZZ9999Z1Z9';
            order.vendor.shopDetails.name = 'CHANGED SHOP';
            order.vendor.displayName = 'CHANGED VENDOR';
            order.vendor.shopDetails.gst = '29ZZZZZ9999Z1Z9';
            for (const [view, invoice, html] of [
                ['customer-copy', c, renderCustomerInvoiceHtml(order)],
                ['vendor-invoice1', c, `<html><head><style>${css}</style></head><body>${renderToStaticMarkup(React.createElement(CustomerView, { order }))}</body></html>`],
                ['vendor-invoice2', p, `<html><head><style>${css}</style></head><body>${renderToStaticMarkup(React.createElement(PlatformView, { order }))}</body></html>`]
            ]) {
                await page.setContent(html, { waitUntil: 'domcontentloaded' });
                await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
                const text = await page.locator('body').innerText();
                assert.ok(text.includes(invoice.invoiceNo), `${name}/${view}: finalized number`);
                assert.ok(!text.includes('Draft —'), `${name}/${view}: no draft`);
                assert.ok(!text.includes('CHANGED'), `${name}/${view}: frozen names`);
                assert.ok(!text.includes('29ZZZZZ9999Z1Z9'), `${name}/${view}: frozen GSTIN`);
                assert.ok(text.includes(`₹${Number(invoice.totalAmount ?? invoice.totalInvoiceAmount).toFixed(2)}`), `${name}/${view}: total`);
                for (const line of invoice.lineItems) {
                    assert.ok(text.includes(line.sacCode), `${name}/${view}: SAC`);
                    assert.ok(text.includes(`₹${line.totalAmount.toFixed(2)}`), `${name}/${view}: line total`);
                }
                for (const [field, label] of [['cgstAmount', 'CGST'], ['sgstAmount', 'SGST'], ['igstAmount', 'IGST']]) {
                    if (invoice[field] > 0) assert.ok(text.includes(label) && text.includes(`₹${invoice[field].toFixed(2)}`), `${name}/${view}: ${label}`);
                }
                if (name === 'interstate') assert.ok(invoice.igstAmount > 0 && invoice.cgstAmount === 0 && invoice.sgstAmount === 0);
                if (view === 'vendor-invoice2') {
                    assert.ok(text.includes(p.spinzytGstin));
                    assert.ok(text.includes(`${p.platformFeeTaxPercent}%`) && text.includes(`${p.logisticsFeeTaxPercent}%`));
                    if (name === 'promotion') assert.ok(text.includes('Spinzyt Promo Share') && text.includes('₹50.00'));
                } else {
                    assert.ok(text.includes(c.displayGstinNo));
                    assert.ok(!text.includes('Spinzyt Promo Share'));
                    if (name === 'promotion') {
                        assert.ok(text.includes('₹50.00'));
                        assert.ok(!text.includes('Promotional Discount'));
                    }
                    if (name === 'C') assert.ok(text.includes('0%') && text.includes('₹318.60'));
                }
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
                assert.equal(overflow, false, `${name}/${view}: horizontal overflow`);
                await page.screenshot({ path: `${output}/${name}-${view}.png`, fullPage: true });
            }
        }
    } finally {
        await browser?.close();
        await vite?.close();
        await mongoose.disconnect();
        await env?.stop();
    }
});
