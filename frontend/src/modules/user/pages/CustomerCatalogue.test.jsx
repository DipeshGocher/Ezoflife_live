import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../../../lib/api', () => ({
  BASE_URL: 'http://api.test',
  UPLOADS_URL: 'http://api.test/uploads/',
  masterServiceApi: { getAll: vi.fn() },
  serviceApi: { getAll: vi.fn() },
  categoryApi: { getAll: vi.fn(), getMain: vi.fn() },
  authApi: {
    getProfile: vi.fn(), getDraftCart: vi.fn(), updateDraftCart: vi.fn(),
  },
  adApi: { getActive: vi.fn() },
  geofenceApi: {},
}));
vi.mock('../../../lib/firebase', () => ({ requestForToken: vi.fn() }));
vi.mock('../../../lib/locationService', () => ({ locationService: {} }));
vi.mock('../../../lib/shippingApi', () => ({
  shippingConfigApi: { getConfig: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../../shared/stores/locationStore', () => ({
  useLocationStore: () => ({ pricingFactor: 1, setZoneData: vi.fn() }),
}));

import { masterServiceApi, serviceApi, categoryApi, authApi, adApi } from '../../../lib/api';
import HomePage from './HomePage';
import AllServicesPage from './AllServicesPage';
import SearchResultsPage from './SearchResultsPage';
import BottomNav from '../components/BottomNav';

const category = { _id: 'category-1', mainCategory: 'Laundry', subCategory: 'Wash', isActive: true };
const master = {
  _id: 'master-1', id: 'master-1', itemName: 'Standard shirt wash', name: 'Standard shirt wash',
  isActive: true, curr_ind: 'y', serviceType: 'normal', targetAudience: 'individual',
  categoryId: category, basePrice: 100, unit: 'per_item', tier: 'Essential',
};
const vendor = {
  _id: 'vendor-1', id: 'vendor-1', name: 'Approved blanket wash',
  status: 'Active', approvalStatus: 'Approved', serviceType: 'individual',
  categoryId: category, basePrice: 200, unit: 'per_item', tier: 'Essential',
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Model the API's exact serviceType matching: the retail catalogue is empty.
  masterServiceApi.getAll.mockImplementation(async ({ serviceType }) =>
    serviceType === 'individual' ? [master, { ...master, _id: 'inactive', id: 'inactive', name: 'Inactive service', isActive: false }] : []);
  serviceApi.getAll.mockImplementation(async ({ serviceType }) =>
    serviceType === 'individual' ? [vendor, { ...vendor, _id: 'pending', id: 'pending', name: 'Pending service', approvalStatus: 'Pending' }] : []);
  categoryApi.getAll.mockResolvedValue([category]);
  categoryApi.getMain.mockResolvedValue([]);
  authApi.getProfile.mockResolvedValue({ addresses: [] });
  authApi.getDraftCart.mockResolvedValue({});
  adApi.getActive.mockResolvedValue(null);
});

const CurrentPath = () => <output data-testid="path">{useLocation().pathname}</output>;

describe.each(['individual', 'retail'])('%s customer experience', (customerType) => {
  beforeEach(() => {
    const user = { _id: 'customer-1', customerType, ...(customerType === 'retail' ? { gstNumber: '23ABCDE1234F1Z5' } : {}) };
    localStorage.setItem('userData', JSON.stringify(user));
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userType', customerType);
    localStorage.setItem('userRole', 'Customer');
    localStorage.setItem('token', 'test-token');
  });

  it.each([
    ['Home', HomePage], ['All Services', AllServicesPage], ['Search', SearchResultsPage],
  ])('shows standard services on %s', async (_name, Page) => {
    render(<MemoryRouter><Page /></MemoryRouter>);

    expect(await screen.findByText('Standard shirt wash')).toBeInTheDocument();
    expect(await screen.findByText('Approved blanket wash')).toBeInTheDocument();
    expect(screen.queryByText('Inactive service')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending service')).not.toBeInTheDocument();
    expect(masterServiceApi.getAll).toHaveBeenCalledWith({ serviceType: 'individual', activeOnly: true });
    expect(serviceApi.getAll).toHaveBeenCalledWith({ serviceType: 'individual', approvedOnly: true });
    expect(JSON.parse(localStorage.getItem('userData')).customerType).toBe(customerType);
  });

  it('labels orders My Orders and opens order history', () => {
    render(<MemoryRouter initialEntries={['/user/home']}><BottomNav /><CurrentPath /></MemoryRouter>);

    expect(screen.queryByText('Bulk Orders')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /My Orders/i }));
    expect(screen.getByTestId('path')).toHaveTextContent('/user/orders');
  });
});
