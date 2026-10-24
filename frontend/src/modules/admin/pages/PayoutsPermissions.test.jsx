import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Payments from './Payouts';
import { adminApi } from '../../../lib/api';
vi.mock('../../../lib/api', () => ({ adminApi: { getCustomerPayments: vi.fn(), getVendorPayments: vi.fn(), recordVendorPayout: vi.fn() } }));
vi.mock('../components/cards/MetricRow', () => ({ default: () => null }));
vi.mock('../components/tables/DataGrid', () => ({ default: ({ data, loading }) => loading ? <p>Loading reports</p> : <div>{data.map(row => <span key={row.id}>{row.customer}</span>)}</div> }));
const customer = { _id: 'customer-1', displayName: 'Visible customer', phone: '9999999991', totalSpent: 150, totalAdvancePaid: 10, totalCodPaid: 0, pendingBalance: 140 };
beforeEach(() => { adminApi.getCustomerPayments.mockReset(); adminApi.getVendorPayments.mockReset(); });
describe('independent payment report permissions', () => {
    it('keeps an authorized customer report usable when vendor settlements are denied', async () => {
        adminApi.getCustomerPayments.mockResolvedValue([customer]); adminApi.getVendorPayments.mockRejectedValue(new Error('Full-area access required'));
        render(<MemoryRouter initialEntries={['/admin/legacy-payments?tab=customer']}><Payments /></MemoryRouter>);
        expect(await screen.findByText('Visible customer')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    it('shows the settlement denial instead of an empty ledger and supports retry', async () => {
        adminApi.getCustomerPayments.mockResolvedValue([customer]);
        adminApi.getVendorPayments.mockRejectedValueOnce(new Error('Full-area access required')).mockResolvedValueOnce([{ _id: 'vendor-1', displayName: 'Visible vendor', phone: '9999999992', pendingBalance: 5 }]);
        render(<MemoryRouter initialEntries={['/admin/legacy-payments?tab=vendor']}><Payments /></MemoryRouter>);
        expect(await screen.findByRole('alert')).toHaveTextContent('Full-area access required');
        fireEvent.click(screen.getByRole('button', { name: 'Retry report' }));
        expect(await screen.findByText('Visible vendor')).toBeInTheDocument();
        expect(adminApi.recordVendorPayout).not.toHaveBeenCalled();
    });
});
