import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminInvoiceSettings from './AdminInvoiceSettings';
import { adminApi } from '../../../lib/api';

vi.mock('../../../lib/api', () => ({ adminApi: { getConfig: vi.fn(), updateConfig: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

test('loads legacy settings, previews new details in both templates and persists them', async () => {
    adminApi.getConfig.mockResolvedValue([{ key: 'invoice_settings', value: { businessName: 'Legacy Co', contactEmail: 'billing@example.com', showLogo: false } }]);
    adminApi.updateConfig.mockImplementation(async (key, value) => ({ key, value }));
    const user = userEvent.setup();
    render(<AdminInvoiceSettings />);
    expect(await screen.findByLabelText('Business name')).toHaveValue('Legacy Co');
    await user.type(screen.getByLabelText('Registered business address'), '42 Main Street');
    await user.type(screen.getByLabelText('Contact phone'), '+91 1234567890');
    await user.type(screen.getByLabelText('Payment instructions'), 'Payment reference is the order number.');
    expect(screen.getByText('42 Main Street', { selector: 'p' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'B2B', exact: true }));
    expect(screen.getByText('42 Main Street', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Payment reference is the order number.', { selector: 'p' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save invoice details' }));
    await waitFor(() => expect(adminApi.updateConfig).toHaveBeenCalledWith('invoice_settings', expect.objectContaining({ businessName: 'Legacy Co', businessAddress: '42 Main Street', contactPhone: '+91 1234567890', showLogo: false })));
});

test('a failed settings load prevents overwriting existing configuration', async () => {
    adminApi.getConfig.mockRejectedValue(new Error('Unavailable'));
    render(<AdminInvoiceSettings />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.getByRole('button', { name: 'Save invoice details' })).toBeDisabled();
});
