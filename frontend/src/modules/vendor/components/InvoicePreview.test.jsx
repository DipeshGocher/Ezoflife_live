import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import InvoicePreview from './InvoicePreview';

const order = {
  orderId: '#ON-100016',
  gstSnapshot: { customerName: 'Frozen customer', vendorName: 'Frozen vendor' },
  invoices: {
    customerInvoice: {
      documentStatus: 'FINALIZED', invoiceNo: 'C-16', scenario: 'B', issuerName: 'Frozen vendor',
      supplierGstin: '27TEST', displayGstinNo: '27TEST', totalAmount: 118, serviceValue: 100, taxAmount: 18,
      cgstAmount: 9, sgstAmount: 9,
      lineItems: [{ description: 'Laundry', taxableValue: 100, unitPrice: 100, quantity: 1, gstRate: 18, cgstAmount: 9, sgstAmount: 9, totalAmount: 118 }],
    },
    platformInvoice: { documentStatus: 'FINALIZED', invoiceNo: 'P-16', totalInvoiceAmount: 23.6, platformFee: 20, platformFeeTax: 3.6, platformFeeTaxPercent: 18 },
  },
};

it('switches invoices without exposing internal labels and restores background access on close', () => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  const trigger = document.createElement('button');
  root.append(trigger);
  trigger.focus();
  const close = vi.fn();
  const { unmount } = render(<InvoicePreview order={order} onClose={close} />);
  expect(root.inert).toBe(true);
  expect(document.body).toHaveAttribute('data-invoice-preview-open');
  expect(document.body.style.overflow).toBe('hidden');
  expect(screen.getByRole('dialog')).toHaveTextContent('C-16');
  expect(screen.getByRole('dialog')).not.toHaveTextContent(/Scenario B|\\rightarrow/);
  expect(screen.getByRole('dialog')).toHaveTextContent('₹118.00');
  fireEvent.click(screen.getByRole('tab', { name: /Invoice 2/ }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('P-16');
  expect(screen.getByRole('tabpanel')).not.toHaveTextContent('C-16');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
  unmount();
  expect(document.body).not.toHaveAttribute('data-invoice-preview-open');
  expect(document.body.style.overflow).toBe('');
  expect(root.inert).not.toBe(true);
  expect(document.activeElement).toBe(trigger);
  root.remove();
});

it('prevents printing a draft invoice', () => {
  render(<InvoicePreview order={{ ...order, invoices: {} }} onClose={() => {}} />);
  expect(screen.getByRole('button', { name: /Print or save/ })).toBeDisabled();
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Draft — Not a Tax Invoice');
});
