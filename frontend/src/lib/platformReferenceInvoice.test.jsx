import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PlatformRevenueInvoicePrint from '../modules/vendor/components/PlatformRevenueInvoicePrint';
import { registeredPlatformInvoiceFixture, unregisteredPlatformInvoiceFixture, invoiceGstNumbers } from '../test/fixtures/registeredInvoice';
import { usesPlatformReferenceTemplate, platformReferenceInvoiceView } from './platformReferenceInvoice';

it('matches Invoice 2 for an unregistered vendor/customer with only Spinzyt GST in the banner', () => {
    const order = unregisteredPlatformInvoiceFixture();
    // Both transaction figures and service lines remain frozen after later changes.
    order.items[0].name = 'CHANGED'; order.ledger = { vendorNetPayout: 99999 }; order.invoices.customerInvoice.totalAmount = 99999;
    const { container } = render(<PlatformRevenueInvoicePrint order={order} />);
    expect(screen.getByRole('heading', { name: 'EZOFLIFE TECHNOLOGY LLP' })).toBeInTheDocument();
    const gst = container.querySelectorAll('[data-invoice-gst]'); expect(gst).toHaveLength(1);
    expect(gst[0].closest('header')).not.toBeNull(); expect(gst[0]).toHaveTextContent(invoiceGstNumbers.spinzyt);
    expect(container.textContent).not.toContain(invoiceGstNumbers.vendor); expect(container.textContent).not.toContain(invoiceGstNumbers.customer);
    const meta = container.querySelector('.reference-meta'); expect(meta).not.toHaveTextContent('Customer'); expect(meta).toHaveTextContent('Unregistered Vendor');
    const table = screen.getByRole('table');
    for (const [label, amount] of [['Subtotal Services','₹1060.00'],['Amount Charged to the Customer','₹1133.16'],['Logistics Fee GST','₹7.20'],['Platform GST','₹3.96'],['Net Payout to Vendor','₹1060.00']]) expect(within(table).getByText(label).closest('tr')).toHaveTextContent(amount);
    expect(within(table).queryByText('Service GST')).not.toBeInTheDocument(); expect(container.textContent).not.toContain('CHANGED');
    expect(container.querySelector('#platform-invoice-content')).not.toBeNull();
});
it.each(['A','B'])('uses the registered-vendor Invoice 2 reference for scenario %s with only Spinzyt GST', scenario => {
    const order = registeredPlatformInvoiceFixture(scenario);
    order.invoices.customerInvoice.totalAmount = 99999; order.ledger = { vendorNetPayout: 99999 };
    order.items[0].price = 99999;
    expect(usesPlatformReferenceTemplate(order)).toBe(true);
    const { container } = render(<PlatformRevenueInvoicePrint order={order} />);
    expect(container.querySelector('.reference-banner')).not.toBeNull();
    const gst = container.querySelectorAll('[data-invoice-gst]'); expect(gst).toHaveLength(1);
    expect(gst[0].closest('header')).not.toBeNull(); expect(gst[0]).toHaveTextContent(invoiceGstNumbers.spinzyt);
    for (const number of [invoiceGstNumbers.customer,invoiceGstNumbers.vendor]) expect(container.textContent).not.toContain(number);
    expect(container.querySelector('.reference-meta')).not.toHaveTextContent('Customer');
    for (const [label,value] of [['Service GST','₹190.80'],['Amount Charged to the Customer','₹1323.96'],['Net Payout to Vendor','₹1250.80']]) expect(screen.getByText(label).closest('tr')).toHaveTextContent(value);
});
it('uses recorded customer and ledger facts for older Invoice 2 records and supports zero fees', () => {
    const order = unregisteredPlatformInvoiceFixture(); delete order.invoices.platformInvoice.presentation;
    order.ledger = { vendorNetPayout: 1060 }; order.invoices.platformInvoice.platformFee = 0;
    const view = platformReferenceInvoiceView(order);
    expect(view.customerTotal).toBe(1133.16); expect(view.netPayout).toBe(1060); expect(view.platformFee).toBe(0);
});
