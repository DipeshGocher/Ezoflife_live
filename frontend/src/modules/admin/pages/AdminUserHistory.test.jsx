import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminUserHistory from './AdminUserHistory';
import { adminApi, ticketApi } from '../../../lib/api';
vi.mock('../../../lib/api', () => ({ adminApi: { getUserHistory: vi.fn() }, ticketApi: { getTicketDetails: vi.fn() } }));
const order = { _id: 'order-1', orderId: '#ON-101', status: 'PROCESSING', totalAmount: 318.6, createdAt: '2026-10-20T08:00:00Z' };
const response = (data = [order]) => ({ user: { _id: 'user-1', displayName: 'Actual customer', role: 'Customer', status: 'approved' }, data, pagination: { page: 1, total: data.length, totalPages: 1 } });
const mount = () => render(<MemoryRouter initialEntries={['/admin/users/user-1/history']}><Routes><Route path="/admin/users/:id/history" element={<AdminUserHistory />} /></Routes></MemoryRouter>);
beforeEach(() => { adminApi.getUserHistory.mockReset(); ticketApi.getTicketDetails.mockReset(); });
describe('user-linked recorded history', () => {
    it('renders actual history and links to the real order', async () => {
        adminApi.getUserHistory.mockResolvedValue(response()); mount();
        expect(await screen.findByText('Actual customer')).toBeInTheDocument();
        expect(screen.getByText('₹318.60')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View order' })).toHaveAttribute('href', '/admin/orders/order-1');
    });
    it('loads support history and reads only the selected conversation', async () => {
        adminApi.getUserHistory.mockResolvedValueOnce(response()).mockResolvedValueOnce(response([{ _id: 'ticket-1', subject: 'Actual support request', category: 'Others', status: 'Open', createdAt: order.createdAt }]));
        ticketApi.getTicketDetails.mockResolvedValue({ _id: 'ticket-1', subject: 'Actual support request', description: 'Recorded description', messages: [{ _id: 'message-1', senderRole: 'Admin', message: 'Recorded response', createdAt: order.createdAt }] });
        mount(); await screen.findByText('#ON-101'); fireEvent.click(screen.getByRole('button', { name: 'Support history' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Read conversation' }));
        expect(await screen.findByText('Recorded response')).toBeInTheDocument();
        expect(ticketApi.getTicketDetails).toHaveBeenCalledWith('ticket-1');
        fireEvent.click(screen.getByRole('button', { name: 'Close conversation' }));
        expect(screen.queryByText('Recorded response')).not.toBeInTheDocument();
    });
    it('handles forbidden/missing records without sample data and allows retry', async () => {
        adminApi.getUserHistory.mockRejectedValueOnce(new Error('Outside permitted areas')).mockResolvedValueOnce(response([])); mount();
        expect(await screen.findByRole('alert')).toHaveTextContent('Outside permitted areas');
        expect(screen.queryByRole('link', { name: 'View order' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('No orders recorded within your permissions.')).toBeInTheDocument();
    });
    it('paginates through recorded orders and ignores a stale page response after switching sections', async () => {
        let resolveOld;
        adminApi.getUserHistory.mockResolvedValueOnce({ ...response(), pagination: { page: 1, total: 30, totalPages: 2 } })
            .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
            .mockResolvedValueOnce(response([]));
        mount(); await screen.findByText('#ON-101'); fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await waitFor(() => expect(adminApi.getUserHistory).toHaveBeenLastCalledWith('user-1', expect.objectContaining({ page: 2 })));
        fireEvent.click(screen.getByRole('button', { name: 'Support history' })); await screen.findByText('No tickets recorded within your permissions.');
        resolveOld(response());
        await waitFor(() => expect(screen.queryByText('#ON-101')).not.toBeInTheDocument());
    });
});
