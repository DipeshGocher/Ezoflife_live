import React from 'react';
import { Navigate } from 'react-router-dom';
import { safeStorage } from '@/lib/safeStorage';

// Signed-in vendors and suppliers go to their own apps. Admins are never sent
// to the admin panel from here: the site root is the customer app.
const HOME_BY_ROLE = {
  vendor: '/vendor/dashboard',
  supplier: '/supplier/dashboard'
};

/** True if the JWT exists and has not expired. */
const isLiveToken = (token) => {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !payload.exp || payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
};

/**
 * Where the customer app starts (also the site root). The splash ad (if any)
 * is shown by SplashAdGate on top of this, so here we only decide:
 * signed-in customer -> home, vendor/supplier -> their app, anyone else
 * (signed out, expired session, or an admin session) -> customer login.
 */
export default function AppEntryRedirect() {
  const token = safeStorage.getItem('token');
  const role = (safeStorage.getItem('userRole') || 'customer').toLowerCase();

  let target = '/user/auth';
  if (isLiveToken(token)) {
    if (role === 'customer' || role === 'user') target = '/user/home';
    else if (HOME_BY_ROLE[role]) target = HOME_BY_ROLE[role];
  }
  return <Navigate to={target} replace />;
}
