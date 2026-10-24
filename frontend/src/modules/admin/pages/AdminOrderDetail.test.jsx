import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import AdminOrderDetail from './AdminOrderDetail';
import { adminApi } from '../../../lib/api';

vi.mock('../../../lib/api', () => ({ adminApi: { getOrderDetail: vi.fn(), getConfig: vi.fn(), issueInvoice: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

const fixture = (overrides = {}) => ({
    _id: 'first-order', orderId: '#ON-101', status: 'PROCESSING', createdAt: '2026-10-20T08:00:00Z',
    customer: { _id: 'customer-one', displayName: 'Alice Customer', phone: '9876543210' },
    vendor: { _id: 'vendor-one', displayName: 'Bob Owner', shopDetails: { name: 'Actual Laundry', address: 'Shop 12' } },
    dropAddress: 'Actual delivery address', items: [{ name: 'Actual service', quantity: 2, price: 100, unit: 'kg' }],
    totalAmount: 318.6, advanceAmount: 15, dueAmount: 303.6, paymentStatus: 'Pending', paymentMethod: 'COD',
    priceBreakdown: { baseWithArea: 200, platformFee: 20, logisticsFee: 50, gstAmount: 48.6 },
    statusHistory: [{ status: 'ORDER_PLACED', timestamp: '2026-10-20T08:00:00Z' }, { status: 'PROCESSING', timestamp: '2026-10-20T09:00:00Z' }], ...overrides
});
function Navigation() {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/admin/orders/second-order')}>Open second order</button>;
}
function mount() {
    return render(<MemoryRouter initialEntries={['/admin/orders/first-order']}>
        <Navigation />
        <Routes><Route path="/admin/orders/:id" element={<AdminOrderDetail />} /></Routes>
    </MemoryRouter>);
}
beforeEach(() => {
    vi.clearAllMocks();
    adminApi.getConfig.mockResolvedValue([{ key: 'invoice_settings', value: { businessName: 'Actual Business', showLogo: false, showTaxes: true } }]);
});

test('loads actual entities, stored events and totals, then previews the same order without repricing', async () => {
    const user = userEvent.setup();
    adminApi.getOrderDetail.mockResolvedValue(fixture());
    const { container } = mount();
    expect(await screen.findByText('Alice Customer')).toBeInTheDocument();
    expect(adminApi.getOrderDetail).toHaveBeenCalledWith('first-order');
    expect(screen.getByText('Actual Laundry')).toBeInTheDocument();
    expect(screen.getByText('Actual delivery address')).toBeInTheDocument();
    expect(screen.getByText('2 kg')).toBeInTheDocument();
    expect(screen.getByText('₹200.00')).toBeInTheDocument();
    expect(screen.getByText('₹318.60')).toBeInTheDocument();
    expect(screen.getByText('Balance due: ₹303.60')).toBeInTheDocument();
    expect(screen.queryByText('Delivered')).not.toBeInTheDocument();
    expect(screen.queryByText('Julian Mendoza')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download Invoice' }));
    const invoice = within(container.querySelector('#invoice-content'));
    expect(invoice.getByText('Actual service')).toBeInTheDocument();
    expect(invoice.getAllByText('₹100.00')).toHaveLength(1);
    expect(invoice.getAllByText('₹200.00')).toHaveLength(2); // line amount and persisted service subtotal
    expect(invoice.getByText('₹318.60')).toBeInTheDocument();
    expect(invoice.getByText('Delivery Fee')).toBeInTheDocument();
    expect(invoice.getByText('Not issued')).toBeInTheDocument();
    expect(invoice.queryByText('Promotional Discount')).not.toBeInTheDocument();
    const popup = vi.spyOn(window, 'open').mockReturnValue(null);
    await user.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
    expect(popup).toHaveBeenCalled();
});

test.each([[404, 'Order not found'], [403, 'Access denied'], [500, 'Unable to load order']])('handles %s without sample order or invoice controls', async (status, title) => {
    adminApi.getOrderDetail.mockRejectedValue(Object.assign(new Error('Request failed'), { status }));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(title);
    expect(screen.queryByRole('button', { name: 'Download Invoice' })).not.toBeInTheDocument();
    expect(screen.queryByText('Julian Mendoza')).not.toBeInTheDocument();
});

test('failed reads can be retried', async () => {
    const user = userEvent.setup();
    adminApi.getOrderDetail.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue(fixture());
    mount();
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Alice Customer')).toBeInTheDocument();
});

test('a delayed response cannot replace a different route or leave an old invoice open', async () => {
    const user = userEvent.setup();
    let finishFirst;
    adminApi.getOrderDetail.mockImplementation(id => id === 'first-order'
        ? new Promise(resolve => { finishFirst = resolve; })
        : Promise.resolve(fixture({ _id: 'second-order', orderId: '#ON-202', customer: { displayName: 'Second Customer' }, statusHistory: [] })));
    mount();
    await user.click(screen.getByRole('button', { name: 'Open second order' }));
    expect(await screen.findByText('Second Customer')).toBeInTheDocument();
    finishFirst(fixture());
    await waitFor(() => expect(screen.queryByText('Alice Customer')).not.toBeInTheDocument());
    expect(screen.getByText('No activity history recorded.')).toBeInTheDocument();
});

test('deleted-party snapshots are shown without linking to nonexistent accounts', async () => {
    adminApi.getOrderDetail.mockResolvedValue(fixture({ customer: null, vendor: null,
        customerSnapshot: { displayName: 'Archived Customer', phone: '1234567890' },
        vendorSnapshot: { displayName: 'Archived Owner', shopName: 'Archived Shop' } }));
    mount();
    expect(await screen.findByText('Archived Customer')).toBeInTheDocument();
    expect(screen.getByText('Archived Shop')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View User Profile' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'View Partner Details' })).toBeDisabled();
});

test('legacy zero-value orders do not acquire fabricated discounts, taxes or completion events', async () => {
    const user = userEvent.setup();
    adminApi.getOrderDetail.mockResolvedValue(fixture({ totalAmount: 0, priceBreakdown: undefined, statusHistory: [],
        items: [{ name: 'Zero item', quantity: 0, price: 0, unit: 'pc' }] }));
    const { container } = mount();
    await user.click(await screen.findByRole('button', { name: 'Download Invoice' }));
    const invoice = within(container.querySelector('#invoice-content'));
    expect(invoice.getByText('Zero item')).toBeInTheDocument();
    expect(invoice.queryByText('Promotional Discount')).not.toBeInTheDocument();
    expect(invoice.queryByText(/^GST \(/)).not.toBeInTheDocument();
    expect(container.querySelector('#invoice-content')).not.toHaveTextContent('NaN');
    expect(screen.getByText('No activity history recorded.')).toBeInTheDocument();
});

test('an open invoice disappears immediately when navigation starts to another order', async () => {
    const user = userEvent.setup();
    adminApi.getOrderDetail.mockImplementation(id => id === 'first-order' ? Promise.resolve(fixture()) : new Promise(() => {}));
    const { container } = mount();
    await user.click(await screen.findByRole('button', { name: 'Download Invoice' }));
    expect(container.querySelector('#invoice-content')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open second order' }));
    expect(container.querySelector('#invoice-content')).not.toBeInTheDocument();
    expect(screen.queryByText('Alice Customer')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading order details');
});


test('issued invoice facts and branding survive changes to the current order and settings', async () => {
    adminApi.getOrderDetail.mockResolvedValue(fixture({ totalAmount: 999, issuedInvoice: { number: 'INV-2026-100001', issuedAt: '2026-10-23T01:00:00Z', settings: { businessName: 'Original issuer', showLogo: false }, facts: fixture({ totalAmount: 318.6 }) } }));
    const user = userEvent.setup(); const { container } = mount();
    await user.click(await screen.findByRole('button', { name: 'Download Invoice' }));
    const invoice = container.querySelector('#invoice-content');
    expect(invoice).toHaveTextContent('Original issuer'); expect(invoice).toHaveTextContent('INV-2026-100001'); expect(invoice).toHaveTextContent('₹318.60');
    expect(invoice).not.toHaveTextContent('₹999.00'); expect(screen.queryByRole('button', { name: 'Issue customer invoice' })).not.toBeInTheDocument();
});
