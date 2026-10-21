import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../../../lib/api', () => ({
  orderApi: { getVendorOrders: vi.fn(), getPoolOrders: vi.fn() },
  authApi: {},
  vendorPaymentApi: { getEarningsSummary: vi.fn(), getPayoutHistory: vi.fn() },
}));
vi.mock('../../../lib/firebase', () => ({ requestForToken: vi.fn() }));
vi.mock('../../../lib/socket', () => ({ default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }));
vi.mock('../../../shared/stores/notificationStore', () => ({ default: () => ({ fetchNotifications: vi.fn() }) }));
vi.mock('../components/VendorHeader', () => ({ default: () => null }));
vi.mock('../../admin/components/InvoicePrint', () => ({ default: () => null }));
vi.mock('../components/PlatformRevenueInvoicePrint', () => ({ default: () => null }));

import Dashboard from './Dashboard';
import { orderApi, vendorPaymentApi } from '../../../lib/api';

const order = {
  _id: 'order-13', orderId: '#ON-100013', status: 'PROCESSING', totalAmount: 82.6,
  createdAt: new Date(Date.now() - 8 * 60000).toISOString(), updatedAt: new Date().toISOString(), items: [],
};
const CurrentPath = () => <output data-testid="path">{useLocation().pathname}</output>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('vendorData', JSON.stringify({ _id: 'vendor-1', status: 'approved' }));
  orderApi.getVendorOrders.mockResolvedValue([order]);
  orderApi.getPoolOrders.mockResolvedValue([]);
  vendorPaymentApi.getEarningsSummary.mockResolvedValue({});
  vendorPaymentApi.getPayoutHistory.mockResolvedValue([]);
});

it('shows one clear details action, support, status and the correctly labelled elapsed time', async () => {
  render(<MemoryRouter initialEntries={[{ pathname: '/vendor/dashboard', state: { initialTab: 'In Progress' } }]}>
    <Dashboard /><CurrentPath />
  </MemoryRouter>);

  expect(await screen.findByText('#ON-100013')).toBeInTheDocument();
  expect(screen.getByText('Time elapsed')).toBeInTheDocument();
  expect(screen.queryByText('Time for Delivery')).not.toBeInTheDocument();
  expect(screen.getByText('Order total')).toBeInTheDocument();
  expect(screen.getByText('₹82.60')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'View order' })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Contact support' }));
  expect(screen.getByTestId('path')).toHaveTextContent('/vendor/order-chat/order-13');
  fireEvent.click(screen.getByRole('button', { name: 'View order' }));
  expect(screen.getByTestId('path')).toHaveTextContent('/vendor/order/order-13');
});
