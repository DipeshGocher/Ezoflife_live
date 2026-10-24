/**
 * Admin panel access model.
 *
 * Module names are the top-level sidebar labels of the admin panel, so the
 * frontend can match them 1:1 (frontend/src/modules/admin/config/adminAccess.js
 * keeps the same list — change both together).
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
    'Invoice Design'
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
    'HR': ['User Management', 'Support Tickets', 'FAQ Manager', 'Career Center', 'Invoice Design', 'Customer Feedback']
};

/** Roles whose access type is fixed regardless of what the form sent. */
export const FORCED_ACCESS_TYPE = {
    'Global Auditor / Developer': 'Read-Only'
};

export const ACCESS_TYPES = ['Read/Write', 'Read-Only'];

/**
 * Master admins manage other admins. Admin accounts without an adminRole
 * predate role-based access (the seeded master account) and keep full rights.
 */
export const isMasterAdmin = (user) =>
    !!user && user.role === 'Admin' && (!user.adminRole || user.adminRole === 'Master Admin');

/** Master admins and the all-module preset roles see every module. */
export const hasFullModuleAccess = (user) =>
    isMasterAdmin(user) || (!!user && ROLE_PRESETS[user.adminRole] === null);
