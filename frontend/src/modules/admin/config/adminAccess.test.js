import { describe, it, expect } from 'vitest';
import { canAccessPath, canAccessModule, firstAllowedPath, moduleForPath } from './adminAccess';

const support = { role: 'Admin', adminRole: 'Customer Support Executive', adminPermissions: ['User Management', 'Orders', 'Support Tickets', 'FAQ Manager'] };
const master = { role: 'Admin', adminRole: 'Master Admin', adminPermissions: [] };
const legacyMaster = { role: 'Admin' };
const auditor = { role: 'Admin', adminRole: 'Global Auditor / Developer', adminPermissions: [] };

describe('admin access', () => {
  it('maps paths to the most specific module', () => {
    expect(moduleForPath('/admin/users/roles')).toBe('User Role');
    expect(moduleForPath('/admin/users')).toBe('User Management');
    expect(moduleForPath('/admin/vendors/approvals')).toBe('Registration Approval');
    expect(moduleForPath('/admin/vendors/123')).toBe('User Management');
    expect(moduleForPath('/admin/orders/abc')).toBe('Orders');
    expect(moduleForPath('/admin/ordersx')).toBe(null);
  });

  it('limits a sub-admin to their modules, including direct URLs', () => {
    expect(canAccessPath(support, '/admin/orders/42')).toBe(true);
    expect(canAccessPath(support, '/admin/help-desk')).toBe(true);
    expect(canAccessPath(support, '/admin/dashboard')).toBe(false);
    expect(canAccessPath(support, '/admin/payments')).toBe(false);
    expect(canAccessPath(support, '/admin/users/roles')).toBe(false);
    expect(canAccessPath(support, '/admin/unmapped-page')).toBe(false);
  });

  it('only master admins manage roles; full-access roles see every module', () => {
    expect(canAccessModule(master, 'User Role')).toBe(true);
    expect(canAccessModule(legacyMaster, 'User Role')).toBe(true);
    expect(canAccessModule(auditor, 'User Role')).toBe(false);
    expect(canAccessPath(auditor, '/admin/payments')).toBe(true);
    expect(canAccessPath(master, '/admin/unmapped-page')).toBe(true);
  });

  it('sends a sub-admin to their first allowed page', () => {
    expect(firstAllowedPath(support)).toBe('/admin/users');
    expect(firstAllowedPath({ adminRole: 'Custom', adminPermissions: [] })).toBe(null);
  });
});
