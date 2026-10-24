import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInvoiceSettings, escapeInvoiceText } from '../../../shared/invoiceSettings.mjs';
import { updateSystemConfig } from '../../src/controllers/adminController.js';
import SystemConfig from '../../src/models/SystemConfig.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('legacy saved details inherit new defaults without losing branding or display preferences', () => {
    const value = normalizeInvoiceSettings({ businessName: 'Existing Co', showLogo: false });
    assert.equal(value.businessName, 'Existing Co');
    assert.equal(value.businessAddress, '');
    assert.equal(value.invoiceTitle, 'Tax Invoice');
    assert.equal(value.showLogo, false);
    assert.equal(normalizeInvoiceSettings(null).businessName, 'SPINZYT');
    assert.equal(escapeInvoiceText('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('invoice updates merge basic details into existing saved values', async t => {
    t.mock.method(SystemConfig, 'findOne', async () => ({ value: { businessName: 'Existing Co', gstNumber: 'OLDGST', showLogo: false } }));
    let written;
    t.mock.method(SystemConfig, 'findOneAndUpdate', async (query, update) => { written = update.value; return { key: query.key, value: written }; });
    const res = response();
    await updateSystemConfig({ body: { key: 'invoice_settings', value: { businessAddress: 'Line one\nLine two', contactPhone: '1234567890', invoiceNote: 'Saved note' } } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(written.businessName, 'Existing Co');
    assert.equal(written.gstNumber, 'OLDGST');
    assert.equal(written.showLogo, false);
    assert.equal(written.businessAddress, 'Line one\nLine two');
    assert.equal(written.invoiceNote, 'Saved note');
});

test('invalid invoice settings return validation errors without persisting them', async t => {
    t.mock.method(SystemConfig, 'findOne', async () => null);
    const write = t.mock.method(SystemConfig, 'findOneAndUpdate', async () => assert.fail('Invalid configuration was written'));
    for (const value of [{ businessName: '' }, { invoiceTitle: '' }, { contactEmail: 'bad-email' }, { logo: 'javascript:alert(1)' }, { showLogo: 'true' }, { businessAddress: 'a'.repeat(501) }, null, []]) {
        const res = response();
        await updateSystemConfig({ body: { key: 'invoice_settings', value } }, res);
        assert.equal(res.statusCode, 400);
    }
    assert.equal(write.mock.calls.length, 0);
});

test('invoice storage errors remain server errors', async t => {
    t.mock.method(SystemConfig, 'findOne', async () => { throw new Error('Database offline'); });
    const res = response();
    await updateSystemConfig({ body: { key: 'invoice_settings', value: { businessName: 'Test' } } }, res);
    assert.equal(res.statusCode, 500);
});
