/**
 * Which admin module an API call belongs to, for role-based access.
 *
 * Only calls made with an Admin token are checked (see enforceAdminModules).
 * Each rule is [methods, path regex, modules]; the first match wins, and the
 * admin needs ANY of the listed modules. MASTER means master admins only.
 * Calls that match no rule are shared lookups (geofence areas, categories,
 * config reads, the admin's own notifications...) and are open to every admin.
 *
 * Module names come from config/adminAccess.js. When adding an admin page,
 * add its write endpoints and any sensitive reads here.
 */
export const MASTER = 'MASTER';

const ANY = '*';
const READ = 'READ';
const WRITE = 'WRITE';

const RULES = [
    [ANY, /^\/api\/admin\/orders(\/|$)/, ['Orders']],
    [ANY, /^\/api\/admin\/audit-events$/, ['Settings']],
    // Admin management and destructive maintenance
    [ANY, /^\/api\/admin\/(invite-sub-admin|sub-admins)(\/|$)/, MASTER],
    [ANY, /^\/api\/admin\/(force-clear-orders|orders-clear-all|users-clear-all|services-clear-all|diagnostic|cloudinary-usage)(\/|$)/, MASTER],
    [ANY, /^\/api\/admin-test-direct$/, MASTER],
    [ANY, /^\/api\/auth\/temp-seed$/, MASTER],

    // Dashboard
    [ANY, /^\/api\/admin\/(stats|dashboard-analytics)(\/|$)/, ['Dashboard']],

    // Registration approval
    [ANY, /^\/api\/admin\/(pending-approvals|approve-vendor|reject-vendor|vendor-request)(\/|$)/, ['Registration Approval']],
    [ANY, /^\/api\/admin\/suppliers\/[^/]+\/(approve|reject)$/, ['Registration Approval']],
    [ANY, /^\/api\/supplier\/requests(\/|$)/, ['Registration Approval']],

    // User management
    [WRITE, /^\/api\/admin\/vendors\/[^/]+\/services\//, ['User Management', 'Vendor Service Request']],
    [READ, /^\/api\/admin\/suppliers$/, ['User Management', 'Vendor Supply Pricing']],
    [ANY, /^\/api\/admin\/(users|customers|register-customer|vendors|suppliers)(\/|$)/, ['User Management']],
    [ANY, /^\/api\/auth\/register-vendor$/, ['User Management']],

    // Dev seeding endpoints
    [ANY, /^\/api\/maintenance(\/|$)/, MASTER],

    // Payments
    [ANY, /^\/api\/admin\/(customer-payments|vendor-payments|refunds|record-vendor-payout|vendor-payouts|payments)(\/|$)/, ['Payments']],

    // Referral settings
    [ANY, /^\/api\/admin\/referrals(\/|$)/, ['Referral Settings']],

    // System config is read everywhere but written from several settings pages
    [WRITE, /^\/api\/admin\/config$/, ['Settings', 'Services & Pricing', 'Invoice Design', 'Payments', 'Referral Settings']],

    // Customer orders
    [ANY, /^\/api\/orders\/walk-in(\/|$)/, ['Orders', 'User Management']],
    [WRITE, /^\/api\/orders(\/|$)/, ['Orders']],
    [READ, /^\/api\/orders(\/|$)/, ['Orders', 'Support Tickets', 'Payments', 'User Management']],

    // B2B (vendor supply) orders
    [ANY, /^\/api\/b2b-orders\/admin\/escrow$/, ['Orders', 'Payments', 'Vendor Supply Pricing']],
    [WRITE, /^\/api\/b2b-orders\/[^/]+\/release$/, ['Orders', 'Payments', 'Vendor Supply Pricing']],
    [ANY, /^\/api\/b2b-orders\/(admin|bulk-status-update)(\/|$)/, ['Vendor Supply Pricing']],

    // Services & pricing
    [ANY, /^\/api\/area-overrides(\/|$)/, ['Services & Pricing']],
    [ANY, /^\/api\/geofence\/pincode-mappings(\/|$)/, ['Services & Pricing']],
    [WRITE, /^\/api\/geofence\/areas(\/|$)/, ['Services & Pricing']],
    [WRITE, /^\/api\/services(\/|$)/, ['Services & Pricing', 'Vendor Service Request']],
    [WRITE, /^\/api\/(categories|master-services|materials|master-pricing)(\/|$)/, ['Services & Pricing']],

    // Vendor supply pricing & supplier product requests
    [WRITE, /^\/api\/vendor-master-supplies(\/|$)/, ['Vendor Supply Pricing', 'Supplier Product Request']],
    [WRITE, /^\/api\/(vendor-supply-categories|supplier-service-zones)(\/|$)/, ['Vendor Supply Pricing']],

    // Support tickets & disputes
    [ANY, /^\/api\/tickets(\/|$)/, ['Support Tickets']],

    // Content
    [READ, /^\/api\/faqs\/admin(\/|$)/, ['FAQ Manager']],
    [WRITE, /^\/api\/faqs(\/|$)/, ['FAQ Manager']],
    [WRITE, /^\/api\/legal\/privacy-policy$/, ['Privacy Policy']],
    [WRITE, /^\/api\/legal\/terms-conditions$/, ['Terms & Conditions']],
    [WRITE, /^\/api\/legal(\/|$)/, ['Privacy Policy', 'Terms & Conditions']],
    [ANY, /^\/api\/media\/upload-pdf$/, ['Privacy Policy', 'Terms & Conditions']],

    // Marketing
    [READ, /^\/api\/ads\/all$/, ['Splash Ads']],
    [WRITE, /^\/api\/ads(\/|$)/, ['Splash Ads']],
    [ANY, /^\/api\/media\/inquiries(\/|$)/, ['Advertise', 'Settings']],
    [ANY, /^\/api\/promotions\/admin(\/|$)/, ['Promotions']],
    [WRITE, /^\/api\/promotions(\/|$)/, ['Promotions']],
    [ANY, /^\/api\/partnerships\/(all|filters)$/, ['Partnerships']],
    [WRITE, /^\/api\/partnerships(\/|$)/, ['Partnerships']],
    [ANY, /^\/api\/feedback\/(all|filters)$/, ['Customer Feedback']],
    [WRITE, /^\/api\/feedback(\/|$)/, ['Customer Feedback']],

    // Career center
    [ANY, /^\/api\/jobs\/admin(\/|$)/, ['Career Center']],
    [WRITE, /^\/api\/jobs(\/|$)/, ['Career Center']]
];

const methodMatches = (spec, method) => {
    if (spec === ANY) return true;
    const isRead = method === 'GET' || method === 'HEAD';
    return spec === READ ? isRead : !isRead;
};

/** Modules allowed to make this call (array), MASTER, or null when shared. */
export const modulesForApi = (method, path) => {
    const clean = (path || '').split('?')[0].replace(/\/+$/, '') || '/';
    const rule = RULES.find(([spec, re]) => methodMatches(spec, method) && re.test(clean));
    return rule ? rule[2] : null;
};
