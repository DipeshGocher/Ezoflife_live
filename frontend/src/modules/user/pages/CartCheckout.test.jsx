import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const priceState = vi.hoisted(() => ({}));

vi.mock('../../../lib/api', () => ({
  BASE_URL: 'http://api.test',
  masterServiceApi: { getAll: vi.fn() }, serviceApi: { getAll: vi.fn() },
  authApi: { getProfile: vi.fn(), updateDraftCart: vi.fn() },
  orderApi: { createRazorpayOrder: vi.fn(), createOrder: vi.fn(), getById: vi.fn(), getNearbyVendors: vi.fn() },
  promotionApi: { getApplicablePromos: vi.fn() }, mediaApi: {},
  geofenceApi: { checkAvailability: vi.fn() }, logisticsApi: {},
}));
vi.mock('../../../lib/shippingApi', () => ({ shippingConfigApi: { getConfig: vi.fn() } }));
vi.mock('../../../shared/stores/locationStore', () => ({
  useLocationStore: Object.assign(() => ({ pricingFactor: 1, ...priceState }), { getState: () => ({ setZoneData: vi.fn() }) }),
}));
vi.mock('../../../lib/socket', () => ({ subscribeSocketRooms: vi.fn(() => vi.fn()), default: { on: vi.fn(), off: vi.fn(), emit: vi.fn() } }));
vi.mock('@react-google-maps/api', () => ({
  useJsApiLoader: () => ({ isLoaded: false }), Autocomplete: () => null,
  GoogleMap: () => null, Marker: () => null, Polyline: () => null, DirectionsRenderer: () => null,
}));
vi.mock('../components/UserHeader', () => ({ default: () => null }));
vi.mock('gsap', () => ({ default: { to: vi.fn(), fromTo: vi.fn() } }));

import { authApi, geofenceApi, masterServiceApi, orderApi, promotionApi, serviceApi } from '../../../lib/api';
import { shippingConfigApi } from '../../../lib/shippingApi';
import CartPage from './CartPage';
import OrderTrackingPage from './OrderTrackingPage';
import { appDialog } from '../../../shared/stores/appDialogStore';

const service = { _id: 'service-1', itemName: 'Shirt wash', basePrice: 100, discountedPrice: 100, avgWeight: 0.5, unit: 'per_item', gst: 0 };
const address = { id: 'address-1', type: 'Home', address: 'Test pickup address, Nashik', location: { lat: 20.0219, lng: 73.7294 }, isDefault: true };
const paidOrder = { _id: 'paid-order-1', orderId: '#ON-123', status: 'ORDER_PLACED', paymentStatus: 'Paid', items: [], totalAmount: 100 };
const paymentProof = { razorpay_order_id: 'checkout-1', razorpay_payment_id: 'payment-1', razorpay_signature: 'proof' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  for (const key of Object.keys(priceState)) delete priceState[key];
  localStorage.clear();
  vi.clearAllMocks();
  masterServiceApi.getAll.mockResolvedValue([service]);
  serviceApi.getAll.mockResolvedValue([]);
  authApi.getProfile.mockResolvedValue({ addresses: [address], walletBalance: 0 });
  authApi.updateDraftCart.mockResolvedValue({});
  promotionApi.getApplicablePromos.mockResolvedValue([]);
  geofenceApi.checkAvailability.mockResolvedValue({ available: true, pricingFactor: 1 });
  shippingConfigApi.getConfig.mockResolvedValue([{ key: 'gst_percent', value: 0 }, { key: 'platform_fee_multiplier', value: 0 }]);
  orderApi.createRazorpayOrder.mockResolvedValue({ id: 'checkout-1', keyId: 'test', amount: 10000, payable: 100, currency: 'INR' });
  orderApi.createOrder.mockResolvedValue(paidOrder);
  orderApi.getById.mockResolvedValue(paidOrder);
  orderApi.getNearbyVendors.mockResolvedValue([]);
  vi.spyOn(appDialog, 'confirm').mockResolvedValue(true);
  vi.spyOn(appDialog, 'alert').mockResolvedValue(undefined);
});

afterEach(() => {
  delete window.Razorpay;
  document.querySelectorAll('script[src*="checkout.razorpay.com"]').forEach(script => script.remove());
});

const renderCheckout = (customerType) => {
  localStorage.setItem('user', JSON.stringify({ _id: 'customer-1', role: 'Customer', customerType,
    ...(customerType === 'retail' ? { gstNumber: '23ABCDE1234F1Z5' } : {}) }));
  localStorage.setItem('cart_quantities', JSON.stringify({ 'service-1': 1 }));
  localStorage.setItem('item_photos', JSON.stringify({ 'service-1': ['/garment.jpg'] }));
  localStorage.setItem('pickup_address', JSON.stringify(address));
  localStorage.setItem('selected_tier', 'Essential');
  return render(checkoutTree());
};
const checkoutTree = () => <MemoryRouter initialEntries={['/user/cart']}><Routes>
    <Route path="/user/cart" element={<CartPage />} />
    <Route path="/user/tracking/:id" element={<OrderTrackingPage />} />
    <Route path="/user/home" element={<p>Unexpected home page</p>} />
  </Routes></MemoryRouter>;

it('recalculates the displayed checkout total after the regional factor changes', async () => {
  const view = renderCheckout('individual');
  await screen.findByRole('button', { name: 'PAY NOW' });
  await waitFor(() => expect(screen.getByText('Total Payable Amount').parentElement).toHaveTextContent('₹100.00'));
  priceState.pricingFactor = 2;
  view.rerender(checkoutTree());
  await waitFor(() => expect(screen.getByText('Total Payable Amount').parentElement).toHaveTextContent('₹200.00'));
});

const openPayment = async () => {
  let options;
  window.Razorpay = vi.fn(function (config) {
    options = config;
    this.on = vi.fn();
    this.open = vi.fn();
  });
  const pay = await screen.findByRole('button', { name: 'PAY NOW' });
  await waitFor(() => expect(pay).toBeEnabled());
  fireEvent.click(pay);
  await waitFor(() => expect(document.querySelector('script[src*="checkout.razorpay.com"]')).not.toBeNull());
  fireEvent.load(document.querySelector('script[src*="checkout.razorpay.com"]'));
  await waitFor(() => expect(options).toBeDefined());
  return options;
};

describe.each(['individual', 'retail'])('%s paid checkout', (customerType) => {
  it('opens vendor search immediately even while draft cleanup and order refresh are pending', async () => {
    const cleanup = deferred();
    const refresh = deferred();
    authApi.updateDraftCart.mockReturnValue(cleanup.promise);
    orderApi.getById.mockReturnValue(refresh.promise);
    renderCheckout(customerType);
    const checkout = await openPayment();
    act(() => { void checkout.handler(paymentProof); });

    expect(await screen.findByText('Waiting for Acceptance')).toBeInTheDocument();
    expect(screen.queryByText('Unexpected home page')).not.toBeInTheDocument();
    expect(orderApi.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      razorpayPaymentId: 'payment-1', razorpayOrderId: 'checkout-1', razorpaySignature: 'proof',
    }));
    await act(async () => { cleanup.resolve({}); refresh.resolve(paidOrder); });
    expect(screen.getByText('Waiting for Acceptance')).toBeInTheDocument();
    expect(screen.queryByText('Unexpected home page')).not.toBeInTheDocument();
  });

  it('keeps the customer on vendor search if draft cleanup fails', async () => {
    authApi.updateDraftCart.mockRejectedValue(new Error('Cleanup unavailable'));
    renderCheckout(customerType);
    const checkout = await openPayment();
    await act(async () => { await checkout.handler(paymentProof); });
    expect(await screen.findByText('Waiting for Acceptance')).toBeInTheDocument();
    expect(screen.queryByText('Unexpected home page')).not.toBeInTheDocument();
  });

  it('opens vendor search for a fully wallet-paid order too', async () => {
    authApi.getProfile.mockResolvedValue({ addresses: [address], walletBalance: 1000 });
    renderCheckout(customerType);
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(await screen.findByRole('button', { name: 'PAY NOW' }));
    expect(await screen.findByText('Waiting for Acceptance')).toBeInTheDocument();
    expect(orderApi.createOrder).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'Wallet', useWallet: true }));
    expect(orderApi.createRazorpayOrder).not.toHaveBeenCalled();
    expect(screen.queryByText('Unexpected home page')).not.toBeInTheDocument();
  });

  it('keeps the cart when the server rejects payment verification', async () => {
    orderApi.createOrder.mockResolvedValue({ message: 'Payment verification failed' });
    renderCheckout(customerType);
    const checkout = await openPayment();
    await act(async () => { await checkout.handler(paymentProof); });
    expect(appDialog.alert).toHaveBeenCalledWith('Payment verification failed');
    expect(screen.getByRole('button', { name: 'PAY NOW' })).toBeEnabled();
    expect(screen.queryByText('Waiting for Acceptance')).not.toBeInTheDocument();
    expect(screen.queryByText('Unexpected home page')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('cart_quantities'))).toEqual({ 'service-1': 1 });
    expect(authApi.updateDraftCart).not.toHaveBeenCalled();
  });

  it('loads vendor search when the tracking URL is opened without navigation state', async () => {
    render(<MemoryRouter initialEntries={['/user/tracking/paid-order-1']}><Routes>
      <Route path="/user/tracking/:id" element={<OrderTrackingPage />} />
    </Routes></MemoryRouter>);
    expect(await screen.findByText('Waiting for Acceptance')).toBeInTheDocument();
    expect(orderApi.getById).toHaveBeenCalledWith('paid-order-1');
  });
});
