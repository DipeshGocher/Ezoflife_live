import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { safeStorage } from '@/lib/safeStorage';

/** True if the JWT exists, is well-formed, and has not expired. */
export const isLiveToken = (token) => {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !payload.exp || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

/**
 * Layout-route guard for a portal's inner pages.
 *
 * Renders the nested routes only when one of `tokenKeys` holds a live session
 * token; otherwise sends the visitor to that portal's login page. The keys
 * mirror lib/sessionToken.js, so "logged in" here means the same thing as
 * "the API calls get a token attached".
 *
 * This is a UX gate only — the API still enforces auth on every request.
 */
export default function RequireAuth({ tokenKeys, loginPath }) {
  const location = useLocation();
  const loggedIn = tokenKeys.some((key) => isLiveToken(safeStorage.getItem(key)));

  if (!loggedIn) {
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }
  return <Outlet />;
}
