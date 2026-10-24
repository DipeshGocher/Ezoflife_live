// Synthetic GSTINs for software verification only; these are not legal identities.
const address = '12 GST Demo Street, Indore, Madhya Pradesh 452001';
const location = { lat: 22.7196, lng: 75.8577 };
const common = { status: 'approved', isProfileComplete: true, address, location };
const customer = (phone, registered) => ({
    ...common, phone, role: 'Customer',
    displayName: `GST Demo ${registered ? 'RD Business' : 'URD Individual'} Customer`,
    customerType: registered ? 'retail' : 'individual',
    businessName: registered ? 'GST Demo Business (Test Only)' : '',
    gstNumber: registered ? '23ABCDE1234F1Z5' : '',
    businessAddress: registered ? address : '',
    addresses: [{ type: registered ? 'Office' : 'Home', address, city: 'Indore', state: 'Madhya Pradesh', pincode: '452001', location, isDefault: true }]
});
const vendor = (phone, registered) => ({
    ...common, phone, role: 'Vendor',
    displayName: `GST Demo ${registered ? 'RD' : 'URD'} Vendor`,
    gstNumber: '',
    shopDetails: {
        name: `GST Demo ${registered ? 'Registered' : 'Unregistered'} Laundry (Test Only)`,
        address: '45 GST Demo Vendor Road, Indore, Madhya Pradesh 452001',
        city: 'Indore', state: 'Madhya Pradesh', pincode: '452001',
        gst: registered ? '23FGHIJ5678K1Z2' : '', services: []
    }
});
export const GST_DEMO_ACCOUNTS = {
    rdCustomer: customer('9876510101', true),
    urdCustomer: customer('9876510102', false),
    rdVendor: vendor('9876510103', true),
    urdVendor: vendor('9876510104', false)
};
