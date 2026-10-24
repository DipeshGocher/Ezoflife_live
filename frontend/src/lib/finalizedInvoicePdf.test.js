import { beforeEach, expect, it, vi } from 'vitest';
import { downloadFinalizedInvoice } from './finalizedInvoicePdf';
import { registeredInvoiceFixture, customerInvoiceScenarioFixture, invoiceGstNumbers } from '../test/fixtures/registeredInvoice';
vi.mock('./brandAssets', () => ({ getBrandLogoDataUrl: vi.fn(async () => 'data:image/png;base64,test') }));
const mocks = vi.hoisted(() => ({ text: vi.fn(), save: vi.fn(), table: vi.fn() }));
vi.mock('jspdf', () => ({ jsPDF: class { constructor() { this.lastAutoTable = { finalY: 120 }; } setFontSize() {} setFillColor() {} rect() {} setTextColor() {} setFont() {} addImage() {} splitTextToSize(value) { return [String(value)]; } text(...args) { mocks.text(...args); } save(...args) { mocks.save(...args); } } }));
vi.mock('jspdf-autotable', () => ({ default: (...args) => mocks.table(...args) }));
beforeEach(() => vi.clearAllMocks());
it('exports finalized customer and platform totals without repricing from changed order values', () => {
    const invoice = { documentStatus: 'FINALIZED', invoiceNo: 'SZ1/26-27/000001', invoiceDate: '2026-10-24', issuerName: 'Original supplier', totalAmount: 118, lineItems: [{ description: 'Stored service', quantity: 2, unitPrice: 50, totalAmount: 118, cgstAmount: 9, sgstAmount: 9 }] };
    const order = { orderId: '#ON-1', totalAmount: 9999, priceBreakdown: { gstAmount: 500 }, invoices: { customerInvoice: invoice, platformInvoice: { ...invoice, totalAmount: undefined, totalInvoiceAmount: 23.6 } } };
    downloadFinalizedInvoice(order);
    expect(mocks.text).toHaveBeenCalledWith('Total: INR 118.00', 15, 132);
    expect(mocks.table.mock.calls[0][1].body).toEqual([['Stored service', '', 2, '50.00', '18.00', '118.00']]);
    downloadFinalizedInvoice(order, 'platform_vendor');
    expect(mocks.text).toHaveBeenCalledWith('Total: INR 23.60', 15, 132);
});
it('refuses a draft document rather than inventing invoice numbers or amounts', () => {
    expect(() => downloadFinalizedInvoice({ invoices: { customerInvoice: { documentStatus: 'DRAFT', totalAmount: 100 } } })).toThrow('after delivery');
    expect(mocks.save).not.toHaveBeenCalled();
});

it('uses the reference table and frozen payout for the registered customer PDF', async () => {
    const order = registeredInvoiceFixture(); order.ledger = { vendorNetPayout: 99999 };
    await downloadFinalizedInvoice(order);
    const summary = mocks.table.mock.calls.map(call => call[1].body).find(body => body.some(row => row[0] === 'Net Payout to Vendor'));
    expect(summary).toContainEqual(['Net Payout to Vendor', 'INR 1250.80']);
    expect(summary).toContainEqual(['Amount Charged to the Customer', 'INR 1323.96']);
    expect(mocks.save).toHaveBeenCalledWith('Invoice_customer_SZ1_26-27_000001.pdf');
});

it.each([['A','customer'],['B','vendor'],['C','spinzyt']])('prints exactly the selected GST identity in the customer PDF for scenario %s', async (scenario, owner) => {
    await downloadFinalizedInvoice(customerInvoiceScenarioFixture(scenario));
    const calls = JSON.stringify({ text: mocks.text.mock.calls, tables: mocks.table.mock.calls.map(call => call[1].body) });
    for (const [party, number] of Object.entries(invoiceGstNumbers)) expect(calls.split(number).length - 1).toBe(party === owner ? 1 : 0);
    if (scenario === 'C') {
        expect(mocks.text).toHaveBeenCalledWith(expect.arrayContaining([`GST # ${invoiceGstNumbers.spinzyt}`]), 19, 41);
        expect(calls).not.toContain('Service GST');
    } else expect(JSON.stringify(mocks.text.mock.calls)).not.toContain('GST #');
});

it('exports the unregistered-vendor Invoice 2 reference and its own invoice number', async () => {
    const { unregisteredPlatformInvoiceFixture } = await import('../test/fixtures/registeredInvoice');
    const order = unregisteredPlatformInvoiceFixture();
    await downloadFinalizedInvoice(order, 'platform_vendor');
    const bodies = mocks.table.mock.calls.map(call => call[1].body);
    expect(bodies[0]).toContainEqual(['Vendor ID: VEN-001', 'Date: 05 May 2026']);
    expect(bodies.flat()).toContainEqual(['Amount Charged to the Customer', 'INR 1133.16']);
    expect(bodies.flat()).toContainEqual(['Net Payout to Vendor', 'INR 1060.00']);
    expect(JSON.stringify(bodies[0])).not.toContain('Customer');
    expect(mocks.save).toHaveBeenCalledWith('Invoice_platform_vendor_SZ2_26-27_000001.pdf');
});

it.each(['A','B'])('downloads the registered-vendor Invoice 2 reference for scenario %s with Service GST', async scenario => {
    const { registeredPlatformInvoiceFixture } = await import('../test/fixtures/registeredInvoice');
    await downloadFinalizedInvoice(registeredPlatformInvoiceFixture(scenario), 'platform_vendor');
    const bodies = mocks.table.mock.calls.map(call => call[1].body);
    expect(bodies.flat()).toContainEqual(['Service GST', 'INR 190.80']);
    expect(bodies.flat()).toContainEqual(['Amount Charged to the Customer', 'INR 1323.96']);
    expect(bodies.flat()).toContainEqual(['Net Payout to Vendor', 'INR 1250.80']);
    const output = JSON.stringify([bodies,mocks.text.mock.calls]);
    expect(output.split(invoiceGstNumbers.spinzyt).length - 1).toBe(1);
    expect(output).not.toContain(invoiceGstNumbers.customer); expect(output).not.toContain(invoiceGstNumbers.vendor);
});
