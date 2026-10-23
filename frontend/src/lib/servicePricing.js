/** Catalogue unit prices before GST, platform fees, delivery, and promotions. */
export function servicePricing(service, {
  pricingFactor = 1, allowDiscount = false, isHeritage = false,
  heritageMultiplier = 1, isExpress = false, expressMultiplier = 1,
} = {}) {
  const base = Number(service.basePrice || service.totalPrice) || 0;
  // A zero discount field means no configured discount, as in server checkout pricing.
  const discounted = Number(service.discountedPrice) || base;
  const source = allowDiscount && service.showDiscountPrice !== false ? discounted : base;
  const factor = (pricingFactor || 1) * (isHeritage ? heritageMultiplier ?? 1 : 1);
  const express = isExpress ? expressMultiplier ?? 1 : 1;
  // Checkout rounds the normal unit price before applying the express surcharge.
  const normalPrice = Math.round(source * factor);
  const price = Math.round(normalPrice * express * 100) / 100;
  const originalPrice = Math.round(Math.round(base * factor) * express * 100) / 100;
  return { normalPrice, price, originalPrice, hasDiscount: price < originalPrice };
}
