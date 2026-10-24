import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import TicketAssignment from './TicketAssignment';
import { ticketApi } from '../../../lib/api';
vi.mock('../../../lib/api', () => ({ ticketApi: { getSupportStaff: vi.fn(), assignTicket: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); ticketApi.getSupportStaff.mockResolvedValue([{ _id: 'admin-2', displayName: 'Support agent', workload: 2 }]); });
test('assignment submits a reason and the visible revision then refreshes', async () => {
    ticketApi.assignTicket.mockResolvedValue({}); const updated = vi.fn();
    render(<TicketAssignment ticket={{ _id: 'ticket', status: 'Open', assignmentVersion: 4 }} onUpdated={updated} />);
    expect(await screen.findByRole('option', { name: 'Support agent (2 open)' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ticket owner'), { target: { value: 'admin-2' } });
    fireEvent.change(screen.getByLabelText('Assignment reason'), { target: { value: 'Billing specialist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save assignment' }));
    await waitFor(() => expect(ticketApi.assignTicket).toHaveBeenCalledWith('ticket', { assignedTo: 'admin-2', expectedVersion: 4, reason: 'Billing specialist' }));
    await waitFor(() => expect(updated).toHaveBeenCalled());
});
test('concurrent assignment conflicts remain visible and do not pretend to save', async () => {
    ticketApi.assignTicket.mockRejectedValue(new Error('Ticket assignment changed. Reload before assigning again.'));
    const updated = vi.fn(); render(<TicketAssignment ticket={{ _id: 'ticket', status: 'Open' }} onUpdated={updated} />);
    fireEvent.change(screen.getByLabelText('Assignment reason'), { target: { value: 'Return to queue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save assignment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket assignment changed'); expect(updated).not.toHaveBeenCalled();
});
