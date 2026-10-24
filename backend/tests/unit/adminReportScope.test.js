import { test } from 'node:test';
import assert from 'node:assert/strict';
import User from '../../src/models/User.js';
import Order from '../../src/models/Order.js';
import ServiceArea from '../../src/models/ServiceArea.js';
import { createAdminReportScope } from '../../src/utils/adminReportScope.js';

test('unrestricted reports preserve original queries without loading scope datasets', async t => {
    t.mock.method(User, 'find', () => assert.fail('Unrestricted report loaded a permission dataset'));
    const scope = await createAdminReportScope({ account: { role: 'Admin', geofenceRestrictions: [] } });
    const query = { status: 'PROCESSING' };
    assert.equal(scope.query('Order', query), query);
});
test('scope storage failure rejects the report and unrelated history is not loaded', async t => {
    t.mock.method(User, 'find', () => ({ select: () => ({ lean: async () => { throw new Error('Scope storage offline'); } }) }));
    t.mock.method(ServiceArea, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
    t.mock.method(Order, 'find', () => assert.fail('User-only report scanned order history'));
    await assert.rejects(createAdminReportScope({ account: { role: 'Admin', geofenceRestrictions: ['Allowed'] } }, ['User']), /Scope storage offline/);
});
