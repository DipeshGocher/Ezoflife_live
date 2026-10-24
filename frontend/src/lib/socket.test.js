import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(options => {
    const listeners = new Map();
    const client = {
        connected: false,
        options,
        on: vi.fn((event, listener) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); }),
        off: vi.fn((event, listener) => listeners.get(event)?.delete(listener)),
        emit: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(() => { client.connected = false; }),
        simulateConnect: () => { client.connected = true; for (const listen of listeners.get('connect') || []) listen(); }
    };
    return client;
}) }));
vi.mock('socket.io-client', () => ({ io: (_url, options) => createClient(options) }));
import socket, { createAuthenticatedSocket, subscribeSocketRooms } from './socket';
import { getSessionToken } from './sessionToken';

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, '', '/user/orders'); });
afterEach(() => { localStorage.clear(); vi.clearAllMocks(); });

describe('authenticated socket subscriptions', () => {
    it('does not connect before a session exists', () => {
        expect(socket.options.autoConnect).toBe(false);
        const client = createAuthenticatedSocket();
        const cleanup = subscribeSocketRooms(client, ['user_1']);
        expect(client.connect).not.toHaveBeenCalled();
        cleanup();
    });

    it('uses the current portal token and refreshes it for each handshake', () => {
        localStorage.setItem('adminToken', 'admin-session');
        localStorage.setItem('vendorToken', 'vendor-session');
        localStorage.setItem('token', 'customer-session');
        const client = createAuthenticatedSocket();
        const callback = vi.fn();
        window.history.replaceState({}, '', '/admin/orders');
        client.options.auth(callback);
        expect(callback).toHaveBeenLastCalledWith({ token: 'admin-session' });
        window.history.replaceState({}, '', '/vendor/dashboard');
        client.options.auth(callback);
        expect(callback).toHaveBeenLastCalledWith({ token: 'vendor-session' });
        window.history.replaceState({}, '', '/user/orders');
        localStorage.setItem('token', 'renewed-customer-session');
        client.options.auth(callback);
        expect(callback).toHaveBeenLastCalledWith({ token: 'renewed-customer-session' });
        expect(getSessionToken()).toBe('renewed-customer-session');
    });

    it('joins on connection and rejoins on reconnect, then removes stale subscriptions', () => {
        localStorage.setItem('token', 'session');
        const client = createAuthenticatedSocket();
        const cleanup = subscribeSocketRooms(client, ['ticket_1']);
        expect(client.connect).toHaveBeenCalledOnce();
        client.simulateConnect();
        expect(client.emit).toHaveBeenLastCalledWith('join_room', 'ticket_1');
        client.emit.mockClear();
        client.simulateConnect();
        expect(client.emit).toHaveBeenCalledWith('join_room', 'ticket_1');
        cleanup();
        expect(client.emit).toHaveBeenLastCalledWith('leave_room', 'ticket_1');
        client.emit.mockClear();
        client.simulateConnect();
        expect(client.emit).not.toHaveBeenCalled();
    });

    it('keeps a room subscribed until its last mounted consumer leaves', () => {
        localStorage.setItem('token', 'session');
        const client = createAuthenticatedSocket();
        const layout = subscribeSocketRooms(client, ['user_1']);
        client.simulateConnect();
        const page = subscribeSocketRooms(client, ['user_1', 'order_1']);
        client.emit.mockClear();
        page();
        expect(client.emit).toHaveBeenCalledWith('leave_room', 'order_1');
        expect(client.emit).not.toHaveBeenCalledWith('leave_room', 'user_1');
        expect(client.connected).toBe(true);
        layout();
        expect(client.emit).toHaveBeenCalledWith('leave_room', 'user_1');
        expect(client.connected).toBe(false);
    });

    it('reconnects a shared client when its session changes', () => {
        localStorage.setItem('token', 'old-session');
        const client = createAuthenticatedSocket();
        const first = subscribeSocketRooms(client, ['user_1']); client.simulateConnect();
        client.disconnect.mockClear(); client.connect.mockClear();
        localStorage.setItem('token', 'new-session');
        const second = subscribeSocketRooms(client, ['user_2']);
        expect(client.disconnect).toHaveBeenCalledOnce();
        expect(client.connect).toHaveBeenCalledOnce();
        expect(client.sessionToken).toBe('new-session');
        first(); second();
    });
});
