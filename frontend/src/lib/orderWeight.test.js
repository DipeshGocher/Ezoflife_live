import { describe, it, expect } from 'vitest';
import { formatOrderWeight, getOrderWeight } from './orderWeight';

describe('order weight display', () => {
    it('shows "—" when no weight is known (never a made-up number)', () => {
        expect(formatOrderWeight({})).toBe('—');
        expect(formatOrderWeight({ totalWeight: null })).toBe('—');
        expect(formatOrderWeight({ totalWeight: 0 })).toBe('—');
    });

    it('labels each source; only weighed weights are exact', () => {
        expect(formatOrderWeight({ totalWeight: 4.5, weightSource: 'weighed' })).toBe('4.5 kg · weighed');
        expect(formatOrderWeight({ totalWeight: 3, weightSource: 'customer' })).toBe('~3 kg · customer estimate');
        expect(formatOrderWeight({ totalWeight: 2.25, weightSource: 'estimated' })).toBe('~2.25 kg · estimated');
    });

    it('treats legacy orders without a source as estimates', () => {
        const w = getOrderWeight({ totalWeight: 1.5 });
        expect(w).toMatchObject({ kg: 1.5, source: 'estimated', exact: false, text: '~1.5 kg' });
    });
});
