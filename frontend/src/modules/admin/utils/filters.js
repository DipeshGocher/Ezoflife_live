export const filterValues = (value) => {
    if (value == null || value === '' || value === 'All' || value === 'all') return [];
    return (Array.isArray(value) ? value : [value]).map(String);
};

// Options within a filter are combined with OR; separate filters still use AND.
export const matchesFilter = (selection, value) => {
    const values = filterValues(selection);
    return !values.length || values.some(item => item.trim().toLowerCase() === String(value ?? '').trim().toLowerCase());
};

export const matchesUserSearch = (user, query) => {
    const term = query.trim().toLowerCase();
    if (!term) return true;
    if ([user.displayName, user.email, user.phone].some(value => String(value || '').toLowerCase().includes(term))) return true;
    // Phone numbers may be entered with spaces, parentheses or country codes.
    const digits = term.replace(/\D/g, '');
    return /^[+\d\s().-]+$/.test(term) && !!digits && String(user.phone || '').replace(/\D/g, '').includes(digits);
};

// Admin list grouping follows the saved business entity, not just company size.
// A legacy GST number helps classify older records with no entity type; this
// grouping does not certify legal or tax registration.
export const vendorRegistrationType = vendor => {
    const type = String(vendor.businessType || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (['unregistered local', 'unregistered', 'local'].includes(type)) return 'unregistered';
    if (['proprietorship', 'sole proprietorship', 'partnership', 'pvt ltd', 'private limited', 'private limited company', 'franchise'].includes(type)) return 'registered';
    const hasGst = [vendor.gstNumber, vendor.shopDetails?.gst].some(value => {
        const number = String(value || '').trim();
        return number && !['n/a', 'na', 'none', 'null', '-', 'unregistered'].includes(number.toLowerCase());
    });
    return hasGst ? 'registered' : 'unregistered';
};
