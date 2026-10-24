/**
 * Admin panel access model. Module names are the top-level sidebar labels and
 * must match backend/src/config/adminAccess.js — change both together.
 */
export const ADMIN_MODULES = [
  'Dashboard',
  'User Management',
  'Registration Approval',
  'Vendor Service Request',
  'Supplier Product Request',
  'Orders',
  'Payments',
  'Services & Pricing',
  'Vendor Supply Pricing',
  'Support Tickets',
  'Notifications',
  'FAQ Manager',
  'Privacy Policy',
  'Terms & Conditions',
  'Splash Ads',
  'Advertise',
  'Referral Settings',
  'Promotions',
  'Partnerships',
  'Customer Feedback',
  'Career Center',
  'Settings',
  'Invoice Design',
];

export const CUSTOM_ROLE = 'Custom';

/** Preset roles -> modules. `null` means every module. */
export const ROLE_PRESETS = {
  'Master Admin': null,
  'Global Auditor / Developer': null,
  'Operations & Pricing Lead': ['Dashboard', 'Registration Approval', 'Vendor Service Request', 'Supplier Product Request', 'Orders', 'Services & Pricing', 'Vendor Supply Pricing'],
  'Customer Support Executive': ['User Management', 'Orders', 'Support Tickets', 'FAQ Manager'],
  'Logistics & Shipping Coordinator': ['Orders', 'Support Tickets', 'Notifications'],
  'Growth & Marketing Admin': ['Splash Ads', 'Advertise', 'Referral Settings', 'Promotions', 'Partnerships'],
  'HR': ['User Management', 'Support Tickets', 'FAQ Manager', 'Career Center', 'Invoice Design', 'Customer Feedback'],
};

/** Roles whose access type is fixed (the backend enforces this too). */
export const FORCED_ACCESS_TYPE = {
  'Global Auditor / Developer': 'Read-Only',
};

/** Master-only area: managing other admins. */
export const USER_ROLE_MODULE = 'User Role';

/**
 * Admin URL prefixes owned by each module. The most specific prefix wins, so
 * /admin/users/roles belongs to User Role, not User Management.
 */
const MODULE_PATHS = {
  [USER_ROLE_MODULE]: ['/admin/users/roles'],
  'Dashboard': ['/admin/dashboard'],
  'User Management': ['/admin/users', '/admin/vendors', '/admin/suppliers'],
  'Registration Approval': ['/admin/vendors/approvals', '/admin/vendors/requests', '/admin/supplier-requests'],
  'Vendor Service Request': ['/admin/vendor-service-requests'],
  'Supplier Product Request': ['/admin/supplier-product-requests'],
  'Orders': ['/admin/orders', '/admin/b2b-escrow'],
  'Payments': ['/admin/payments'],
  'Services & Pricing': [
    '/admin/services', '/admin/categories', '/admin/geofencing', '/admin/master-services',
    '/admin/geofence-table', '/admin/geofence-pincode-mapping', '/admin/master-pricing',
    '/admin/pricing', '/admin/pricing-preview', '/admin/pricing-overrides', '/admin/materials',
  ],
  'Vendor Supply Pricing': ['/admin/vendor-supply-pricing'],
  'Support Tickets': ['/admin/help-desk', '/admin/dispute-center'],
  'Notifications': ['/admin/notifications'],
  'FAQ Manager': ['/admin/faqs'],
  'Privacy Policy': ['/admin/privacy-policy'],
  'Terms & Conditions': ['/admin/terms-conditions'],
  'Splash Ads': ['/admin/ads'],
  'Advertise': ['/admin/advertise'],
  'Referral Settings': ['/admin/referral-settings'],
  'Promotions': ['/admin/promotions', '/admin/create-promotion', '/admin/promotion-table', '/admin/geofence-promotion'],
  'Partnerships': ['/admin/partnerships'],
  'Customer Feedback': ['/admin/feedback'],
  'Career Center': ['/admin/careers'],
  'Settings': ['/admin/settings', '/admin/media'],
  'Invoice Design': ['/admin/invoice-settings'],
};

const PATH_INDEX = Object.entries(MODULE_PATHS)
  .flatMap(([module, prefixes]) => prefixes.map((prefix) => ({ module, prefix })))
  .sort((a, b) => b.prefix.length - a.prefix.length);

/** The module that owns an admin pathname, or null if none does. */
export const moduleForPath = (pathname) => {
  const path = (pathname || '').replace(/\/+$/, '');
  const hit = PATH_INDEX.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
  return hit ? hit.module : null;
};

/** Accounts without an adminRole predate role-based access and keep full rights. */
export const isMasterAdmin = (adminData) =>
  !!adminData && (!adminData.adminRole || adminData.adminRole === 'Master Admin');

const hasFullModuleAccess = (adminData) =>
  isMasterAdmin(adminData) || ROLE_PRESETS[adminData?.adminRole] === null;

export const canAccessModule = (adminData, module) => {
  if (module === USER_ROLE_MODULE) return isMasterAdmin(adminData);
  if (hasFullModuleAccess(adminData)) return true;
  const allowed = (adminData?.adminPermissions || []).map((p) => p.trim().toLowerCase());
  return allowed.includes(String(module).trim().toLowerCase());
};

/** Unmapped admin pages are open to full-access admins only. */
export const canAccessPath = (adminData, pathname) => {
  const module = moduleForPath(pathname);
  return module ? canAccessModule(adminData, module) : hasFullModuleAccess(adminData);
};

/** Where to send an admin who opened a page they can't use. */
export const firstAllowedPath = (adminData) => {
  const module = ADMIN_MODULES.find((m) => canAccessModule(adminData, m));
  return module ? MODULE_PATHS[module][0] : null;
};

export const readAdminData = () => {
  try {
    return JSON.parse(localStorage.getItem('adminData') || 'null');
  } catch {
    return null;
  }
};
