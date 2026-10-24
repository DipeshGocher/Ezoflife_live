import { matchesUserSearch, matchesFilter, vendorRegistrationType } from './filters';

test('searches email case-insensitively and phone formatting without losing other filters', () => {
    const users = [
        { displayName: 'Alice', phone: '+91 98765 43210', email: 'ALICE@example.com', status: 'Active' },
        { displayName: 'Bob', phone: '1234567890', email: 'bob@example.com', status: 'Pending' }
    ];
    expect(users.filter(user => matchesUserSearch(user, 'alice@EXAMPLE'))).toEqual([users[0]]);
    expect(users.filter(user => matchesUserSearch(user, '9876543210'))).toEqual([users[0]]);
    expect(users.filter(user => matchesUserSearch(user, '(98765) 43210'))).toEqual([users[0]]);
    expect(users.filter(user => matchesUserSearch(user, '') && matchesFilter(['Pending'], user.status))).toEqual([users[1]]);
    expect(matchesUserSearch({}, 'alice')).toBe(false);
});


test('registered vendor grouping includes all registered entity types, not just companies and franchises', () => {
    for (const businessType of ['Proprietorship', 'Partnership', 'Pvt Ltd', 'Franchise', ' partnership ', 'Private Limited', 'Pvt. Ltd.']) {
        expect(vendorRegistrationType({ businessType })).toBe('registered');
    }
    expect(vendorRegistrationType({ businessType: 'Unregistered/Local', gstNumber: 'Legacy conflicting value' })).toBe('unregistered');
    expect(vendorRegistrationType({ businessType: 'LOCAL' })).toBe('unregistered');
});
test('legacy vendors use stored GST details when the business type is absent', () => {
    expect(vendorRegistrationType({ gstNumber: '27ABCDE1234F1Z5' })).toBe('registered');
    expect(vendorRegistrationType({ shopDetails: { gst: '27ABCDE1234F1Z5' } })).toBe('registered');
    expect(vendorRegistrationType({ gstNumber: 'N/A', shopDetails: { gst: '' } })).toBe('unregistered');
    expect(vendorRegistrationType({})).toBe('unregistered');
});
