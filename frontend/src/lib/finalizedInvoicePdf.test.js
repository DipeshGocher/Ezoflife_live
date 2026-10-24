import { beforeEach, expect, it, vi } from 'vitest';
import { downloadFinalizedInvoice } from './finalizedInvoicePdf';
const mocks = vi.hoisted(() => ({ text: vi.fn(), save: vi.fn(), table: vi.fn() }));
vi.mock('jspdf', () => ({ jsPDF: class { constructor() { this.lastAutoTable = { finalY: 120 }; } setFontSize() {} text(...args) { mocks.text(...args); } save(...args) { mocks.save(...args); } } }));
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
