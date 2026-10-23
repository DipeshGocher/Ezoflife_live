import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../lib/api', () => ({
  BASE_URL: 'http://api.test', authApi: { getProfile: vi.fn() }, serviceApi: { getAll: vi.fn() }, promotionApi: {},
}));
vi.mock('../components/VendorHeader', () => ({ default: () => null }));
import { authApi, serviceApi } from '../../../lib/api';
import VendorMyServices from './VendorMyServices';

const master = { _id: 'saree-1', itemName: 'cotton saree', basePrice: 200, discountedPrice: 10,
  categoryId: { mainCategory: 'Dry cleaning', subCategory: 'Household' } };
let discounts;
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('user', JSON.stringify({ _id: 'vendor-1' }));
  discounts = true;
  serviceApi.getAll.mockResolvedValue([]);
  authApi.getProfile.mockResolvedValue({ location: { lat: 20.02, lng: 73.72 },
    shopDetails: { services: [{ id: 'saree-1', name: 'cotton saree', vendorRate: 200, status: 'approved', active: true }] } });
  vi.stubGlobal('fetch', vi.fn(async url => ({ ok: true, json: async () => {
    if (url.includes('/master-services')) return [master];
    if (url.includes('/geofence/')) return { available: true, areaId: 'nashik', pricingFactor: 1,
      allowDiscount: discounts, expressMultiplier: 1.1, heritageMultiplier: 1.5 };
    // A stale regional pricing row must not override current geofence factors.
    return { data: [{ serviceId: { _id: 'saree-1' }, areaMultiplier: 2, surgeMultiplier: 2, heritageMultiplier: 2 }] };
  } })));
});

it.each([
  [true, ['₹200', '₹10', '₹11', '₹15', '₹17']],
  [false, ['₹200', '₹200', '₹220', '₹300', '₹330']],
])('shows customer-facing regional prices with discounts enabled: %s', async (enabled, expected) => {
  discounts = enabled;
  render(<MemoryRouter><VendorMyServices /></MemoryRouter>);
  const row = (await screen.findByText('cotton saree', {}, { timeout: 6500 })).closest('tr');
  const prices = within(row).getAllByRole('cell').slice(-5).map(cell => cell.textContent.trim());
  expect(prices).toEqual(expected);
}, 10000);
