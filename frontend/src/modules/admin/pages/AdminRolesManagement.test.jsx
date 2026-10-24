import React from 'react';
import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminRolesManagement from './AdminRolesManagement';
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let zones, invitation;
beforeEach(() => {
    zones = Array.from({ length: 60 }, (_, index) => ({ _id: `zone-${index}`, areaName: `Location ${String(index + 1).padStart(2, '0')}` }));
    invitation = null;
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
        if (String(url).includes('/invite-sub-admin')) { invitation = JSON.parse(options.body); return { ok: true, json: async () => ({ activationLink: 'https://example.test/activate' }) }; }
        return { ok: true, json: async () => String(url).includes('/geofence/areas') ? zones : [] };
    }));
});
afterEach(() => vi.unstubAllGlobals());
const open = async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminRolesManagement /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Add New Role' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Geofence restrictions' })).toBeEnabled());
    return user;
};
const fill = async user => {
    await user.type(screen.getByPlaceholderText('e.g. John'), 'Test');
    await user.type(screen.getByPlaceholderText('e.g. Doe'), 'Admin');
    await user.type(screen.getByPlaceholderText('john.doe@company.com'), 'admin@example.test');
    await user.type(screen.getByPlaceholderText('9999999999'), '9990001111');
};
test('many geofences stay collapsed and searchable selections survive filtering', async () => {
    const user = await open(), trigger = screen.getByRole('button', { name: 'Geofence restrictions' });
    expect(screen.queryByRole('checkbox', { name: 'Location 01' })).not.toBeInTheDocument();
    await user.click(trigger);
    const search = screen.getByRole('searchbox', { name: 'Search Geofence restrictions' });
    await user.type(search, 'Location 01'); await user.click(screen.getByRole('checkbox', { name: 'Location 01', exact: true }));
    await user.clear(search); await user.type(search, 'Location 60');
    await user.click(screen.getByRole('checkbox', { name: 'Location 60', exact: true }));
    await user.clear(search);
    expect(screen.getByRole('checkbox', { name: 'Location 01', exact: true })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Location 60', exact: true })).toBeChecked();
    await user.keyboard('{Escape}'); expect(trigger).toHaveFocus(); expect(trigger).toHaveTextContent('(2)');
    expect(screen.queryByRole('searchbox', { name: 'Search Geofence restrictions' })).not.toBeInTheDocument();
    await fill(user); await user.click(screen.getByRole('button', { name: 'Generate Invitation' }));
    await waitFor(() => expect(invitation?.geofences).toEqual(['Location 01', 'Location 60']));
});
test('clearing restrictions submits the existing unrestricted empty-array contract', async () => {
    const user = await open();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'Custom');
    await user.click(screen.getByRole('checkbox', { name: 'Orders', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Geofence restrictions' }));
    await user.click(screen.getByRole('checkbox', { name: 'Location 01', exact: true }));
    await user.click(screen.getByRole('checkbox', { name: 'All locations (no restrictions)', exact: true }));
    await user.keyboard('{Escape}'); await fill(user);
    await user.click(screen.getByRole('button', { name: 'Generate Invitation' }));
    await waitFor(() => expect(invitation?.geofences).toEqual([]));
    expect(invitation.permissions).toEqual(['Orders']);
});
