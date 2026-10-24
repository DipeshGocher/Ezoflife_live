import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi, test, beforeEach, expect } from 'vitest';
import UserLayout from './UserLayout';
import { authApi } from '../../../lib/api';
vi.mock('../../../lib/api', () => ({ authApi: { getProfile: vi.fn() }, orderApi: {} }));
vi.mock('../../../lib/socket', () => ({ default: { on: vi.fn(), off: vi.fn() }, subscribeSocketRooms: () => () => {} }));
vi.mock('../components/UserHeader', () => ({ default: () => <div>Customer header</div> }));
vi.mock('../components/BottomNav', () => ({ default: () => null }));
vi.mock('../../vendor/components/VendorHeader', () => ({ default: () => <div>Vendor header</div> }));
beforeEach(() => {
    localStorage.clear(); localStorage.setItem('token', 'existing-session'); localStorage.setItem('userRole', 'customer');
    localStorage.setItem('user', JSON.stringify({ _id: 'customer-one', isProfileComplete: true }));
    authApi.getProfile.mockReset();
});
const mount = () => render(<MemoryRouter initialEntries={['/user/home']}><Routes><Route path="/user/*" element={<UserLayout />} /><Route path="/vendor/dashboard" element={<div>Vendor dashboard destination</div>} /></Routes></MemoryRouter>);
test('a final approved profile refresh exposes vendor mode using the existing session', async () => {
    authApi.getProfile.mockResolvedValue({ _id: 'customer-one', role: 'Vendor', status: 'approved', onboardingStage: 'COMPLETED' });
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Open vendor dashboard' }));
    expect(await screen.findByText('Vendor dashboard destination')).toBeInTheDocument();
    expect(localStorage.getItem('userRole')).toBe('vendor'); expect(localStorage.getItem('vendorToken')).toBe('existing-session');
});
test('initial approval cannot unlock vendor mode', async () => {
    authApi.getProfile.mockResolvedValue({ _id: 'customer-one', role: 'Customer', status: 'approved', onboardingStage: 'SERVICE_SELECTION' });
    mount(); expect(await screen.findByText('Customer header')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open vendor dashboard' })).not.toBeInTheDocument(); expect(localStorage.getItem('userRole')).toBe('customer');
});
