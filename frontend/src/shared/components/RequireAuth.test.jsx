import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from './RequireAuth';

const jwt = (expOffsetSeconds) =>
  `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }))}.s`;

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/user/auth" element={<div>LOGIN PAGE</div>} />
        <Route element={<RequireAuth tokenKeys={['token']} loginPath="/user/auth" />}>
          <Route path="/user/profile" element={<div>PROFILE PAGE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('RequireAuth', () => {
  beforeEach(() => localStorage.clear());

  it('sends a logged-out visitor to the login page', () => {
    renderAt('/user/profile');
    expect(screen.getByText('LOGIN PAGE')).toBeTruthy();
    expect(screen.queryByText('PROFILE PAGE')).toBeNull();
  });

  it('lets a visitor with a live token through', () => {
    localStorage.setItem('token', jwt(3600));
    renderAt('/user/profile');
    expect(screen.getByText('PROFILE PAGE')).toBeTruthy();
  });

  it('treats an expired token as logged out', () => {
    localStorage.setItem('token', jwt(-60));
    renderAt('/user/profile');
    expect(screen.getByText('LOGIN PAGE')).toBeTruthy();
  });

  it('treats a malformed token as logged out', () => {
    localStorage.setItem('token', 'not-a-jwt');
    renderAt('/user/profile');
    expect(screen.getByText('LOGIN PAGE')).toBeTruthy();
  });
});
