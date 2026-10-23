import { describe, expect, it } from 'vitest';
import { servicePricing } from './servicePricing';

describe('catalogue price consistency', () => {
  const saree = { basePrice: 200, discountedPrice: 10 };
  const region = { allowDiscount: true, pricingFactor: 1, expressMultiplier: 1.1, heritageMultiplier: 1.5 };
  it.each([
    [{}, 10], [{ isExpress: true }, 11], [{ isHeritage: true }, 15],
    [{ isHeritage: true, isExpress: true }, 16.5],
    [{ allowDiscount: false }, 200], [{ allowDiscount: false, isExpress: true }, 220],
    [{ pricingFactor: 2 }, 20],
  ])('uses the active regional/tier configuration (%j)', (selection, expected) => {
    expect(servicePricing(saree, { ...region, ...selection }).price).toBe(expected);
  });
  it('respects service-level discount visibility', () => {
    expect(servicePricing({ ...saree, showDiscountPrice: false }, region)).toMatchObject({ price: 200, hasDiscount: false });
  });
  it.each([0, undefined, null])('does not cross out an unchanged price for discount %s', discountedPrice => {
    expect(servicePricing({ basePrice: 500, discountedPrice }, region)).toMatchObject({ price: 500, originalPrice: 500, hasDiscount: false });
  });
  it('rounds the unit price before express, matching checkout', () => {
    expect(servicePricing({ basePrice: 10.4 }, { pricingFactor: 1.2, isExpress: true, expressMultiplier: 1.4 })).toMatchObject({ normalPrice: 12, price: 16.8 });
  });
  it('uses the base rate outside a discount-enabled region', () => {
    expect(servicePricing(saree).price).toBe(200);
  });
});
