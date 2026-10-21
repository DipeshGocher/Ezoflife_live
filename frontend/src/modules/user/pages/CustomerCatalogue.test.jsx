import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../../lib/api', () => ({
  BASE_URL: 'http://api.test',
  UPLOADS_URL: 'http://api.test/uploads/',
  masterServiceApi: { getAll: vi.fn() },
  serviceApi: { getAll: vi.fn() },
  categoryApi: { getAll: vi.fn(), getMain: vi.fn() },
  authApi: {
    getProfile: vi.fn(), getDraftCart: vi.fn(), updateDraftCart: vi.fn(),
    requestOtp: vi.fn(),
  },
  adApi: { getActive: vi.fn() },
  faqApi: { getAll: vi.fn() },
  ticketApi: {},
  orderApi: { getMyOrders: vi.fn() },
  adminApi: { getConfig: vi.fn() },
  notificationApi: { getNotifications: vi.fn(), markAsRead: vi.fn(), clearAll: vi.fn() },
  geofenceApi: {},
}));
vi.mock('../../../lib/socket', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('../components/UserHeader', () => ({ default: () => null }));
vi.mock('../../vendor/components/VendorHeader', () => ({ default: () => <p>Vendor header</p> }));
vi.mock('@react-google-maps/api', () => ({
  useJsApiLoader: () => ({ isLoaded: false }),
  GoogleMap: () => null, Marker: () => null, StandaloneSearchBox: () => null, Autocomplete: () => null,
}));
vi.mock('../../../lib/firebase', () => ({ requestForToken: vi.fn() }));
vi.mock('../../../lib/locationService', () => ({ locationService: {} }));
vi.mock('../../../lib/shippingApi', () => ({
  shippingConfigApi: { getConfig: vi.fn().mockResolvedValue({}) },
}));
vi.mock('../../../shared/stores/locationStore', () => ({
  useLocationStore: () => ({ pricingFactor: 1, setZoneData: vi.fn() }),
}));

import { masterServiceApi, serviceApi, categoryApi, authApi, adApi, faqApi, orderApi, adminApi, notificationApi } from '../../../lib/api';
import HomePage from './HomePage';
import AllServicesPage from './AllServicesPage';
import SearchResultsPage from './SearchResultsPage';
import BottomNav from '../components/BottomNav';
import MoreMenuPage from './MoreMenuPage';
import UserProfilePage from './UserProfilePage';
import FAQPage from './FAQPage';
import HelpCenterPage from './HelpCenterPage';
import WalletPage from './WalletPage';
import OrdersHistoryPage from './OrdersHistoryPage';
import NotificationsPage from './NotificationsPage';
import ProfileCreationPage from './ProfileCreationPage';
import useNotificationStore from '../../../shared/stores/notificationStore';
import UserLayout from '../layouts/UserLayout';
import AppEntryRedirect from './AppEntryRedirect';
import AuthPage from './AuthPage';

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
  adminApi.getConfig.mockResolvedValue([]);
  orderApi.getMyOrders.mockResolvedValue([]);
  faqApi.getAll.mockResolvedValue([
    { _id: 'public', question: 'Public help', answer: 'Public answer', targetRole: 'All' },
    { _id: 'customer', question: 'Customer help', answer: 'Customer answer', targetRole: 'Customer' },
    { _id: 'vendor', question: 'Vendor help', answer: 'Vendor answer', targetRole: 'Vendor' },
    { _id: 'supplier', question: 'Supplier help', answer: 'Supplier answer', targetRole: 'Supplier' },
  ]);
  useNotificationStore.setState({ notifications: [], unreadCount: 0 });
  notificationApi.getNotifications.mockResolvedValue([
    { _id: 'notice-1', type: 'order_update', title: 'Your order is ready', message: 'Ready for delivery', role: 'user', createdAt: new Date().toISOString(), isRead: false },
  ]);
  notificationApi.markAsRead.mockResolvedValue({});
  notificationApi.clearAll.mockResolvedValue({});
});

describe('normal customer entry and onboarding', () => {
  const setCustomer = (overrides = {}) => {
    const user = { _id: 'normal-customer', role: 'Customer', customerType: 'individual', ...overrides };
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userData', JSON.stringify(user));
    localStorage.setItem('userRole', 'customer');
    localStorage.setItem('userType', 'individual');
    return user;
  };
  const entry = () => render(<MemoryRouter initialEntries={['/user']}>
    <Routes>
      <Route path="/user" element={<AppEntryRedirect />} />
      <Route path="/user/home" element={<p>Normal customer home</p>} />
      <Route path="/user/auth" element={<p>Customer sign-in</p>} />
    </Routes>
  </MemoryRouter>);

  it('takes a signed-in normal customer to Home', () => {
    setCustomer();
    localStorage.setItem('token', `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`);
    entry();
    expect(screen.getByText('Normal customer home')).toBeInTheDocument();
  });

  it.each([null, -3600])('takes a missing or expired customer session to sign-in (%s)', (expiryOffset) => {
    setCustomer();
    if (expiryOffset !== null) {
      localStorage.setItem('token', `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiryOffset }))}.signature`);
    }
    entry();
    expect(screen.getByText('Customer sign-in')).toBeInTheDocument();
  });

  it('directs an incomplete normal customer to profile setup', () => {
    setCustomer({ isProfileComplete: false });
    localStorage.setItem('token', 'test-token');
    render(<MemoryRouter initialEntries={['/user/home']}>
      <Routes>
        <Route element={<UserLayout />}>
          <Route path="/user/home" element={<p>Customer home</p>} />
          <Route path="/user/profile/create" element={<p>Individual profile setup</p>} />
        </Route>
      </Routes>
    </MemoryRouter>);
    expect(screen.getByText('Individual profile setup')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /My Orders/i })).not.toBeInTheDocument();
  });

  it('keeps individual setup when a stale session type says retail', () => {
    setCustomer();
    localStorage.setItem('userType', 'retail');
    render(<MemoryRouter><ProfileCreationPage /></MemoryRouter>);
    expect(screen.getByText('Search Your Location')).toBeInTheDocument();
    expect(screen.queryByText('Business GST Number')).not.toBeInTheDocument();
    expect(screen.queryByText('Business Name')).not.toBeInTheDocument();
  });

  it('defaults new customer setup to individual', () => {
    render(<MemoryRouter><ProfileCreationPage /></MemoryRouter>);
    expect(screen.getByText('Search Your Location')).toBeInTheDocument();
    expect(screen.queryByText('Business GST Number')).not.toBeInTheDocument();
  });

  it('requests normal customer login without changing the customer type', async () => {
    authApi.requestOtp.mockResolvedValue({ message: 'OTP sent successfully' });
    render(<MemoryRouter><AuthPage /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText('000 000 0000'), { target: { value: '9876500001' } });
    await waitFor(() => expect(authApi.requestOtp).toHaveBeenCalledWith('9876500001', 'WhatsApp', 'login', {}));
  });

  it('registers new customers as individual by default', async () => {
    authApi.requestOtp.mockResolvedValue({ message: 'OTP sent successfully' });
    render(<MemoryRouter><AuthPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Signup' }));
    await screen.findByRole('heading', { name: 'Create Account' });
    fireEvent.change(await screen.findByPlaceholderText('000 000 0000'), { target: { value: '9876500002' } });
    await waitFor(() => expect(authApi.requestOtp).toHaveBeenCalledWith('9876500002', 'WhatsApp', 'signup', { customerType: 'individual' }));
  });
});

const CurrentPath = () => <output data-testid="path">{useLocation().pathname}</output>;

describe.each([
  ['individual', ''], ['retail', ''], ['retail', '23ABCDE1234F1Z5'], ['individual', '23ABCDE1234F1Z5'],
])('%s customer experience (GST: %s)', (customerType, gstNumber) => {
  beforeEach(() => {
    const user = { _id: 'customer-1', role: 'Customer', customerType, gstNumber, displayName: 'Test Customer', addresses: [], isProfileComplete: true };
    authApi.getProfile.mockResolvedValue({ ...user, walletBalance: 250 });
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

  it('shows the shared More menu and opens each destination', () => {
    render(<MemoryRouter><MoreMenuPage /><CurrentPath /></MemoryRouter>);
    const destinations = {
      'Become a Vendor': '/user/become-vendor', 'Become a Supplier': '/user/become-supplier',
      'Advertise with us': '/user/advertise', 'Partner with us': '/user/partnerships',
      Wallet: '/user/profile/wallet', Notifications: '/user/notifications',
      'App Feedback': '/user/feedback', Careers: '/user/careers',
      'Refer us': '/user/referral', 'Help & FAQ': '/user/support',
    };
    for (const [label, path] of Object.entries(destinations)) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label, 'i') }));
      expect(screen.getByTestId('path')).toHaveTextContent(path);
    }
  });

  it('shows profile, address book, and customer legal links', async () => {
    render(<MemoryRouter><UserProfilePage /></MemoryRouter>);
    expect(await screen.findByText('Test Customer')).toBeInTheDocument();
    expect(screen.getByText('Saved Addresses')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
    expect(screen.getByText('Terms & Conditions')).toBeInTheDocument();
    await waitFor(() => expect(authApi.getProfile).toHaveBeenCalledWith('customer-1'));
  });

  it.each([['FAQ', FAQPage], ['Help Center', HelpCenterPage]])('shows customer and shared FAQs in %s', async (_name, Page) => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    expect(await screen.findByText('Customer help')).toBeInTheDocument();
    expect(screen.getByText('Public help')).toBeInTheDocument();
    expect(screen.queryByText('Vendor help')).not.toBeInTheDocument();
    expect(screen.queryByText('Supplier help')).not.toBeInTheDocument();
  });

  it('loads the customer wallet and transaction history', async () => {
    render(<MemoryRouter><WalletPage /></MemoryRouter>);
    expect(await screen.findByText('₹250')).toBeInTheDocument();
    expect(screen.getByText('Transaction History')).toBeInTheDocument();
    expect(orderApi.getMyOrders).toHaveBeenCalledWith('customer-1');
  });

  it('loads customer order history without a business-only filter', async () => {
    render(<MemoryRouter><OrdersHistoryPage /></MemoryRouter>);
    await waitFor(() => expect(orderApi.getMyOrders).toHaveBeenCalledWith('customer-1', {}));
    expect(await screen.findByText('No active orders')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Past Orders' }));
    expect(await screen.findByText('No history found')).toBeInTheDocument();
  });

  it('loads saved customer notifications, marks them read, and clears them for this customer', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Your order is ready'));
    await waitFor(() => expect(notificationApi.markAsRead).toHaveBeenCalledWith('notice-1'));
    expect(notificationApi.getNotifications).toHaveBeenCalledWith('customer-1', 'user');
    fireEvent.click(screen.getByRole('button', { name: 'Clear Log Archive' }));
    await waitFor(() => expect(notificationApi.clearAll).toHaveBeenCalledWith('customer-1', 'user'));
    await waitFor(() => expect(screen.queryByText('Your order is ready')).not.toBeInTheDocument());
  });

  it('shows customer socket alerts while excluding vendor and supplier alerts', async () => {
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    await screen.findByText('Your order is ready');
    const { addNotification } = useNotificationStore.getState();
    // Distinct IDs also mirror events arriving at different times.
    act(() => {
      addNotification('order_update', 'Customer socket alert', 'Customer update', 'customer', { id: 'customer-socket' });
      addNotification('order_update', 'Vendor socket alert', 'Vendor update', 'vendor', { id: 'vendor-socket' });
      addNotification('order_update', 'Supplier socket alert', 'Supplier update', 'supplier', { id: 'supplier-socket' });
    });
    expect(screen.getByText('Customer socket alert')).toBeInTheDocument();
    expect(screen.queryByText('Vendor socket alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Supplier socket alert')).not.toBeInTheDocument();
  });

  it('opens profile setup with the stored customer type', () => {
    render(<MemoryRouter><ProfileCreationPage /></MemoryRouter>);
    if (customerType === 'retail') {
      expect(screen.getByText('Business GST Number')).toBeInTheDocument();
      expect(screen.getByText('Business Name')).toBeInTheDocument();
    } else {
      expect(screen.queryByText('Business GST Number')).not.toBeInTheDocument();
    }
  });

  it('keeps completed customers in the customer layout with all four footer sections', () => {
    render(<MemoryRouter initialEntries={['/user/home']}>
      <Routes>
        <Route element={<UserLayout />}>
          <Route path="/user/home" element={<p>Customer home content</p>} />
        </Route>
        <Route path="/user/profile/create" element={<p>Unexpected onboarding</p>} />
      </Routes>
    </MemoryRouter>);
    expect(screen.getByText('Customer home content')).toBeInTheDocument();
    for (const label of ['Home', 'My Orders', 'Profile', 'More']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
    expect(screen.queryByText('Vendor header')).not.toBeInTheDocument();
    expect(screen.queryByText('Unexpected onboarding')).not.toBeInTheDocument();
  });
});
