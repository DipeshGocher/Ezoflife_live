import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCondition, textFilter, matchesFilter, dateFilter, priceFilter } from '../../src/utils/queryFilters.js';
import Category from '../../src/models/Category.js';
import { categoryController } from '../../src/controllers/categoryController.js';

test('checkbox values retain punctuation and cast numbers and booleans independently', () => {
    assert.deepEqual(filterCondition('["A, B & Co.","C++"]'), { $in: ['A, B & Co.', 'C++'] });
    assert.deepEqual(filterCondition('["true","false"]', value => value === 'true'), { $in: [true, false] });
    assert.deepEqual(filterCondition('["0","500"]', Number), { $in: [0, 500] });
    assert.equal(filterCondition('legacy'), 'legacy');
    const condition = textFilter('["C++ (East)","A.B"]');
    assert.equal(condition.$in[0].test('C++ (East)'), true);
    assert.equal(condition.$in[0].test('CCCC East'), false);
    assert.equal(condition.$in[1].test('AxB'), false);
    assert.equal(matchesFilter('["Pending","Active"]', 'ACTIVE'), true);
    assert.equal(matchesFilter('["Pending","Active"]', 'Blocked'), false);
    assert.equal(matchesFilter('', 'Blocked'), true);
});

test('selected dates and price ranges form unions, without overwriting other filter conditions', () => {
    const dates = dateFilter('["2026-10-01","2026-10-03"]');
    assert.equal(dates.$or.length, 2);
    assert.equal(dates.$or[0].createdAt.$gte.getDate(), 1);
    assert.equal(dates.$or[1].createdAt.$lte.getDate(), 3);
    assert.equal(dates.$or[1].createdAt.$lte.getHours(), 23);
    assert.deepEqual(priceFilter('["0-100","500+","200"]'), { $or: [
        { wholesaleRate: { $gte: 0, $lte: 100 } },
        { wholesaleRate: { $gte: 500 } },
        { wholesaleRate: 200 }
    ] });
});

test('category endpoint combines checkbox filters before counting and paginating', async t => {
    let counted, queried;
    t.mock.method(Category, 'countDocuments', async query => { counted = query; return 12; });
    t.mock.method(Category, 'find', query => {
        queried = query;
        return { sort: () => ({ skip: skip => ({ limit: async limit => {
            assert.equal(skip, 10);
            assert.equal(limit, 10);
            return [{ mainCategory: 'Cleaning' }];
        } }) }) };
    });
    const res = { json: body => { res.body = body; }, status: () => res };
    await categoryController.getAll({ query: { page: '2', limit: '10', mainCategory: '["Cleaning","Laundry"]', isActive: '["true","false"]' } }, res);
    assert.deepEqual(queried, counted);
    assert.equal(queried.mainCategory.$in.length, 2);
    assert.deepEqual(queried.isActive, { $in: [true, false] });
    assert.equal(res.body.pagination.total, 12);
    assert.equal(res.body.pagination.totalPages, 2);
    assert.equal(res.body.data.length, 1);
});
