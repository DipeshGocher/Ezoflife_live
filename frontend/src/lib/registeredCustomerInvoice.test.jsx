import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { registeredInvoiceFixture, customerInvoiceScenarioFixture, invoiceGstNumbers } from '../test/fixtures/registeredInvoice';
import { renderCustomerInvoiceHtml } from './customerInvoiceHtml';
import { registeredCustomerInvoiceView } from './registeredCustomerInvoice';
import InvoicePrint from '../modules/admin/components/InvoicePrint';

it('matches the supplied registered-pair layout using frozen service, charge and payout facts', () => {
    const order = registeredInvoiceFixture();
    // Later profile, item and ledger edits cannot overwrite an issued invoice.
    order.customer.displayName = 'Changed customer'; order.vendor.displayName = 'Changed vendor'; order.ledger = { vendorNetPayout: 99999 };
    order.items[0].serviceType = 'Changed service'; order.totalAmount = 99999;
    render(<InvoicePrint order={order} />);
    expect(screen.getByRole('heading', { name: 'EZOFLIFE TECHNOLOGY LLP' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    for (const [label,value] of [['Subtotal Services','₹1060.00'],['Service GST','₹190.80'],['Amount Charged to the Customer','₹1323.96'],['Logistics Fee GST','₹7.20'],['Platform GST','₹3.96'],['Net Payout to Vendor','₹1250.80']]) {
        const row = within(table).getByText(label).closest('tr'); expect(row).toHaveTextContent(value);
    }
    expect(screen.queryByText(/Changed/)).not.toBeInTheDocument();
    expect(within(table).getAllByText('9994')).toHaveLength(4);
    expect(renderCustomerInvoiceHtml(order)).toContain('registered-invoice');
    expect(registeredCustomerInvoiceView(order).services).toHaveLength(4);
});
it.each([['A','customer'],['B','vendor'],['C','spinzyt']])('renders exactly one correct GST number for scenario %s in preview and print', (scenario, owner) => {
    const order = customerInvoiceScenarioFixture(scenario);
    const { container } = render(<InvoicePrint order={order} settings={{ gstNumber: invoiceGstNumbers.spinzyt }} />);
    const nodes = container.querySelectorAll('[data-invoice-gst]');
    expect(nodes).toHaveLength(1); expect(nodes[0]).toHaveAttribute('data-invoice-gst', owner);
    expect(nodes[0]).toHaveTextContent(invoiceGstNumbers[owner]);
    expect(Boolean(nodes[0].closest('header'))).toBe(scenario === 'C');
    const html = renderCustomerInvoiceHtml(order, { gstNumber: invoiceGstNumbers.spinzyt });
    for (const [party, number] of Object.entries(invoiceGstNumbers)) {
        expect(container.textContent.includes(number)).toBe(party === owner);
        expect(html.split(number).length - 1).toBe(party === owner ? 1 : 0);
    }
    if (scenario === 'C') expect(within(screen.getByRole('table')).queryByText('Service GST')).not.toBeInTheDocument();
    else expect(within(screen.getByRole('table')).getByText('Service GST')).toBeInTheDocument();
});
it('escapes customer input, refuses draft printing and never substitutes missing fees with invented amounts', () => {
    const order = registeredInvoiceFixture(); order.gstSnapshot.customerName = '<script>bad()</script>';
    const html = renderCustomerInvoiceHtml(order);
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;'); expect(html).not.toContain('<script>bad()');
    delete order.invoices.customerInvoice.presentation;
    expect(registeredCustomerInvoiceView(order).platformFee).toBeUndefined();
    order.invoices.customerInvoice.documentStatus = 'DRAFT';
    expect(() => renderCustomerInvoiceHtml(order)).toThrow('after delivery');
});

it.each([['A','customer'],['B','vendor'],['C','spinzyt']])('keeps the same single identity for historical preview %s', async (scenario, owner) => {
    const RecordedInvoice = (await import('../modules/admin/components/RecordedInvoicePrint')).default;
    const { container } = render(<RecordedInvoice order={customerInvoiceScenarioFixture(scenario)} settings={{ gstNumber: invoiceGstNumbers.spinzyt }} recordedOnly />);
    for (const [party, number] of Object.entries(invoiceGstNumbers)) expect(container.textContent.split(number).length - 1).toBe(party === owner ? 1 : 0);
});
