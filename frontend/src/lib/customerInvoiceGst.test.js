import { expect, it } from 'vitest';
import { customerInvoiceGst } from './customerInvoiceGst';
import { customerInvoiceScenarioFixture, invoiceGstNumbers } from '../test/fixtures/registeredInvoice';
it.each([['A','customer'],['B','vendor'],['C','spinzyt']])('uses recorded %s identities even when profile values and the display label are stale', (scenario, owner) => {
    const order = customerInvoiceScenarioFixture(scenario);
    order.customer.gstNumber = 'LIVE_CUSTOMER'; order.vendor.gstNumber = 'LIVE_VENDOR';
    order.invoices.customerInvoice.displayGstinLabel = 'Vendor GSTIN';
    order.invoices.customerInvoice.displayGstinNo = 'WRONG_VENDOR_NUMBER';
    const selected = customerInvoiceGst(order, { gstNumber: 'CURRENT_PLATFORM' });
    expect(selected.owner).toBe(owner); expect(selected.value).toBe(invoiceGstNumbers[owner]);
});
it('does not substitute another party when a finalized customer GST number is missing', () => {
    const order = customerInvoiceScenarioFixture('A'); order.invoices.customerInvoice.recipientGstin = '';
    expect(customerInvoiceGst(order).value).toBe(''); expect(customerInvoiceGst(order).owner).toBe('customer');
});
it.each([['customer','vendor','customer'],['','vendor','vendor'],['','','spinzyt']])('uses the same one-number rule for historical records without a tax snapshot', (customer, vendor, owner) => {
    const selected = customerInvoiceGst({ customer: { gstNumber: customer }, vendor: { shopDetails: { gst: vendor } } }, { gstNumber: 'spinzyt' });
    expect(selected).toMatchObject({ owner, value: owner });
});
