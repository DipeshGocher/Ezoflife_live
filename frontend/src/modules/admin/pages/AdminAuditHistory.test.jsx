import { describe, beforeEach, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminAuditHistory from './AdminAuditHistory';
import { adminApi } from '../../../lib/api';
vi.mock('../../../lib/api', () => ({ adminApi: { getAuditEvents: vi.fn() } }));
const event = { _id: 'audit-1', operationId: 'operation-1', actorId: 'actor-1', targetId: 'target-1', method: 'PATCH', path: '/api/admin/users/target-1/toggle-status', outcome: 'Succeeded', statusCode: 200, createdAt: '2026-10-23T12:00:00Z', before: { status: 'approved' }, after: { status: 'rejected', isBlocked: true } };
const result = (data = [event]) => ({ data, pagination: { page: 1, total: data.length, totalPages: 1 }, visibility: 'all' });
const mount = () => render(<MemoryRouter><AdminAuditHistory /></MemoryRouter>);
beforeEach(() => { adminApi.getAuditEvents.mockReset(); });
describe('admin audit history', () => {
    it('shows recorded action, correlation and safe state changes', async () => {
        adminApi.getAuditEvents.mockResolvedValue({ ...result(), visibility: 'own' }); mount();
        expect(await screen.findByText('Succeeded (200)')).toBeInTheDocument();
        expect(screen.getByText(/Showing your own audit history/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('View details'));
        expect(screen.getByText('operation-1')).toBeInTheDocument();
        expect(screen.getByText('{"status":"rejected","isBlocked":true}')).toBeInTheDocument();
    });
    it('submits search and combines checkbox outcome filters before server pagination', async () => {
        adminApi.getAuditEvents.mockResolvedValue(result()); mount(); await screen.findByText('Succeeded (200)');
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search audit history' }), { target: { value: 'toggle-status' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
        await waitFor(() => expect(adminApi.getAuditEvents).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'toggle-status', page: 1 })));
        fireEvent.click(screen.getByRole('button', { name: 'Audit outcome' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Denied', exact: true }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Failed', exact: true }));
        await waitFor(() => expect(adminApi.getAuditEvents).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: ['Denied', 'Failed'], search: 'toggle-status', page: 1 })));
    });
    it('shows permission/network errors and supports retry without showing stale rows', async () => {
        adminApi.getAuditEvents.mockRejectedValueOnce(new Error('Access denied')).mockResolvedValueOnce(result([])); mount();
        expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
        expect(screen.queryByText('Succeeded (200)')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('No audit events match these filters.')).toBeInTheDocument();
    });
    it('requests the next server page and ignores a late response from a previous search', async () => {
        let resolveOld;
        adminApi.getAuditEvents.mockResolvedValueOnce({ ...result(), pagination: { page: 1, total: 30, totalPages: 2 } })
            .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
            .mockResolvedValueOnce(result([{ ...event, _id: 'new', path: '/api/admin/config' }]));
        mount(); await screen.findByText('Succeeded (200)');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await waitFor(() => expect(adminApi.getAuditEvents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search audit history' }), { target: { value: 'config' } });
        fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
        await screen.findByText('/api/admin/config'); resolveOld(result());
        await waitFor(() => expect(screen.queryByText(event.path)).not.toBeInTheDocument());
    });
});
