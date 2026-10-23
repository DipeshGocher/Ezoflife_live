import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
vi.mock('../../../lib/api', () => ({
  authApi: {}, orderApi: { getVendorOrders: vi.fn() },
  vendorPaymentApi: { getEarningsSummary: vi.fn(), getPayoutHistory: vi.fn() },
}));
vi.mock('../components/VendorHeader', () => ({ default: () => null }));
import { orderApi, vendorPaymentApi } from '../../../lib/api';
import Earnings from './Earnings';

it('shows only delivered ledger earnings and preserves paise instead of substituting service sales', async () => {
  localStorage.clear();
  localStorage.setItem('vendorData', JSON.stringify({ _id: 'vendor-1' }));
  vendorPaymentApi.getEarningsSummary.mockResolvedValue({ totalEarnings: 82.65, pendingBalance: 82.65 });
  vendorPaymentApi.getPayoutHistory.mockResolvedValue([]);
  const base = { createdAt: new Date().toISOString(), priceBreakdown: { baseWithArea: 200 }, ledger: { vendorNetPayout: 82.65 } };
  orderApi.getVendorOrders.mockResolvedValue([
    { ...base, _id: 'done', orderId: '#EARNED', status: 'DELIVERED' },
    { ...base, _id: 'active', orderId: '#NOT-EARNED', status: 'PROCESSING' },
    { ...base, _id: 'cancel', orderId: '#CANCELLED', status: 'CANCELLED' },
  ]);
  render(<MemoryRouter><Earnings /></MemoryRouter>);
  expect(await screen.findByText('#EARNED')).toBeInTheDocument();
  expect(screen.getByText('#EARNED').closest('.justify-between')).toHaveTextContent('₹82.65');
  expect(screen.queryByText('#NOT-EARNED')).not.toBeInTheDocument();
  expect(screen.queryByText('#CANCELLED')).not.toBeInTheDocument();
  expect(screen.queryByText('₹200')).not.toBeInTheDocument();
});
