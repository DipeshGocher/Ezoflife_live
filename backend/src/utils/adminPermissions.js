// Existing accounts without a named admin role retain their legacy permissions.
// Named roles always resolve the persisted module grants, never JWT claims.
export const hasAdminPermission = (account, permission) => !account.adminRole || account.adminRole === 'Master Admin' || (account.adminPermissions || []).some(value => value.toLowerCase() === permission.toLowerCase());
export const adminPermissionForRequest = req => {
    const path = req.originalUrl.split('?')[0];
    if (['GET', 'HEAD'].includes(req.method) && /^\/api\/(categories|geofence\/areas)\/?$/.test(path)) return null;
    if (/^\/api\/admin\/(config|sidebar-counts|audit-events)(\/|$)/.test(path) && ['GET', 'HEAD'].includes(req.method)) return null;
    const rules = [
        [/^\/api\/admin\/(sub-admins|invite-sub-admin|users-clear-all|services-clear-all|orders-clear-all|force-clear-orders|diagnostic)/, 'Settings'],
        [/^\/api\/admin\/(dashboard-analytics|stats)/, 'Dashboard'],
        [/^\/api\/admin\/(approve-vendor|reject-vendor|pending-approvals|vendor-request|supplier-requests)/, 'Registration Approval'],
        [/^\/api\/admin\/vendors\/[^/]+\/services/, 'Vendor Service Request'],
        [/^\/api\/admin\/(customer-payments|vendor-payments|vendor-payouts|record-vendor-payout)/, 'Dashboard'],
        [/^\/api\/admin\/orders/, 'Orders'],
        [/^\/api\/admin\/(users|vendors|customers|suppliers|register-customer)/, 'User Management'],
        [/^\/api\/admin\/(config|cloudinary-usage)/, 'Settings'],
        [/^\/api\/tickets/, 'Support Tickets'],
        [/^\/api\/orders/, 'Orders'],
        [/^\/api\/b2b-orders/, 'Orders'],
        [/^\/api\/notifications/, 'Notifications'],
        [/^\/api\/(master-pricing|master-services|services|categories|geofence|area-overrides)/, 'Services & Pricing'],
        [/^\/api\/(vendor-supply-categories|vendor-master-supplies|supplier-service-zones|vendor-product-queries|materials)/, 'Vendor Supply Pricing'],
        [/^\/api\/faqs/, 'FAQ Manager'], [/^\/api\/feedback/, 'Customer Feedback'],
        [/^\/api\/media/, 'Settings'], [/^\/api\/promotions/, 'Promotions'], [/^\/api\/ads/, 'Splash Ads'],
        [/^\/api\/legal/, 'Settings'], [/^\/api\/referrals/, 'Referral Settings'],
        [/^\/api\/partnerships/, 'Partnerships'], [/^\/api\/(jobs|labor)/, 'Career Center'],
        [/^\/api\/maintenance/, 'Settings']
    ];
    return rules.find(([pattern]) => pattern.test(path))?.[1] || null;
};
