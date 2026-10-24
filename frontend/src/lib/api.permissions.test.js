import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const savedFetch = window.fetch;
beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/help-desk');
    localStorage.setItem('adminToken', 'valid-admin-session');
    localStorage.setItem('adminAuth', 'true');
});
afterEach(() => {
    window.fetch = savedFetch;
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('support API permission errors', () => {
    it('keeps a valid admin session on 403 and surfaces the denied operation', async () => {
        window.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Read-only access' }), { status: 403 }));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { ticketApi } = await import('./api');
        await expect(ticketApi.updateTicketStatus('ticket-1', 'Closed')).rejects.toMatchObject({ message: 'Read-only access', status: 403 });
        expect(localStorage.getItem('adminToken')).toBe('valid-admin-session');
        expect(localStorage.getItem('adminAuth')).toBe('true');
        expect(window.location.pathname).toBe('/admin/help-desk');
    });

    it('preserves successful support response shapes and attaches the session token', async () => {
        const response = { _id: 'ticket-1', messages: [{ message: 'Hello' }] };
        const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
        window.fetch = transport;
        const { ticketApi } = await import('./api');
        await expect(ticketApi.sendMessage('ticket-1', { message: 'Hello' })).resolves.toEqual(response);
        expect(transport.mock.calls[0][1].headers.Authorization).toBe('Bearer valid-admin-session');
    });
});


it('rejects denied account mutations instead of treating them as saved', async () => {
    window.fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ message: 'Outside permitted service areas' }), { status: 403 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { adminApi } = await import('./api');
    await expect(adminApi.toggleUserStatus('outside-account')).rejects.toMatchObject({ status: 403 });
    await expect(adminApi.updateSupplier('outside-account', { displayName: 'No' })).rejects.toMatchObject({ status: 403 });
    await expect(adminApi.approveVendor('outside-account')).rejects.toMatchObject({ status: 403 });
    expect(localStorage.getItem('adminAuth')).toBe('true');
});

it('sends only editable admin profile fields and carries scoped walk-in address proof', async () => {
    const transport = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ _id: 'account-1' }), { status: 200 })); window.fetch = transport;
    const { adminApi, authApi } = await import('./api');
    await adminApi.updateUserProfile('account-1', { displayName: 'Edited', status: 'rejected', role: 'Admin', password: 'private', walletBalance: 999, adminAccessType: 'Read/Write' });
    expect(JSON.parse(transport.mock.calls[0][1].body)).toEqual({ displayName: 'Edited', status: 'rejected' });
    await authApi.updateProfile('account-1', { address: 'Updated destination' }, 'scoped-proof');
    expect(transport.mock.calls[1][1].headers['X-Walk-In-Authorization']).toBe('scoped-proof');
    await authApi.updateProfile('account-1', { shopDetails: { services: [{ id: 'service-1', adminRate: 999, rejectionReason: 'private policy', status: 'approved', active: true }] } });
    expect(JSON.parse(transport.mock.calls[2][1].body).shopDetails.services[0]).toEqual({ id: 'service-1', status: 'approved', active: true });
});

it('surfaces dashboard authorization failures without clearing a valid session', async () => {
    window.fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ message: 'Report access denied' }), { status: 403 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { dashboardApi } = await import('./api');
    await expect(dashboardApi.getAnalytics()).rejects.toMatchObject({ status: 403, message: 'Report access denied' });
    expect(localStorage.getItem('adminAuth')).toBe('true');
});


it('rejects a failed media upload rather than reporting it as published', async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, message: 'Media storage unavailable' }), { status: 503 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { mediaApi } = await import('./api');
    await expect(mediaApi.upload(new FormData())).rejects.toMatchObject({ status: 503, message: 'Media storage unavailable' });
});
