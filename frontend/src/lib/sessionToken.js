/**
 * Pick the token for the portal currently being used. Each portal stores its own
 * key, and a browser may hold several (e.g. staff testing both apps).
 */
export const getSessionToken = () => {
    const path = (typeof window !== 'undefined' && window.location?.pathname) || '';
    const pick = (...keys) => keys.map(k => localStorage.getItem(k)).find(Boolean) || null;

    if (path.startsWith('/admin')) return pick('adminToken', 'token');
    if (path.startsWith('/vendor')) return pick('vendorToken', 'token');
    if (path.startsWith('/supplier')) return pick('supplierToken', 'token');
    return pick('token', 'user_auth_token', 'vendorToken', 'supplierToken', 'adminToken');
};

