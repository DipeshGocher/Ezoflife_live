# Calculation audit — 23 October 2026

Scope: customer catalogue/cart/payment amounts, vendor earnings and supply-cart formulas, admin customer balances/refund totals/pricing preview, GST invoice reconciliation, promotions, wallet credits, and payout reservations. Verification uses source inspection and isolated test databases/fake payment services. No production records, tax settings, wallet balances, payouts, or payments were changed.

## Confirmed corrections

| Area | Before | Correction |
| --- | --- | --- |
| Customer cart | Memoized subtotal and tax could stay stale after a regional pricing or discount change. | Unit-price callback and dependent totals now track price inputs. |
| Customer currency display | Checkout rounded fees, GST, wallet usage and payable amount to whole rupees. | Show two decimal places. |
| Catalogue Express rates | Displaying an Express rate as a whole rupee could make a two-item estimate differ from checkout (₹16.50 shown as ₹17, producing ₹34 rather than ₹33). | Preserve paise after applying the Express multiplier on all shared catalogue displays. |
| Customer promotion display | Negative or oversized promotion values could produce an invalid displayed discount. | Clamp the display discount to zero through the order amount, matching checkout. |
| Online payment accounting | A full verified online capture could still record a balance due if the legacy advance percentage was below 100. | Record the full verified remaining payment and zero due. |
| COD accounting | Pending COD orders could record an advance that was never collected. | Record zero advance and the remaining amount due. |
| Admin customer payments | Gross order totals, discounts, wallet payments and recorded paid status were not reconciled consistently, producing phantom balances. | Sum net checkout amounts, account for paid/wallet portions, preserve vendor cashback semantics, exclude cancelled orders, and round monetary totals. Applies to active and archived customer summaries. |
| Admin vendor refunds | Summed undiscounted order totals even when an exact refund amount was recorded. | Prefer the recorded refund amount; retain historical fallback for records without an amount. |
| Wallet cancellation | The wallet was credited, then an undefined variable threw before cancellation finished. | Remove the invalid reference; regression verifies cancellation completes and a repeated request does not credit the wallet twice. |
| Vendor earnings list | Legacy status strings hid current delivered orders; rows displayed rounded gross service sales instead of net ledger earnings. | Show delivered ledger-backed earnings with paise, excluding cancelled/in-progress orders. |

The preceding pricing consistency changes remain included: shared frontend catalogue calculations and server-authoritative admin preview. The full audit caught and corrected a preview response-format regression (`gst` remains a percentage string). The old GST-preview test's assumed obsolete 20% fee formula was updated to the current checkout formula.

## Verification

New regressions exercise regional cart changes, wallet-only and mixed paid balances, outstanding COD amounts, a full online payment with a 5% legacy advance setting, wallet cancellation retries, exact refund aggregation, and vendor net earnings display.

The broader suites cover registered/unregistered customer/vendor combinations, zero and mixed GST rates, interstate invoice splits, platform discounts and vendor cashback, paise-level payments, replay prevention, supply platform fees, payout reservations, bank-pending/reversed transfers, and invoice finalization. These software tests do not verify real payment-provider balances or legal tax treatment.

Results: the complete backend run passed 130 unit tests, 1,055 API tests and 47 GST verification tests (1,232 total). After adding the exact-refund aggregation regression, the affected 10-test admin API suite passed again. The final frontend run passed 182 tests; the production build and whitespace checks passed. Existing bundle-size/dynamic-import build warnings remain. Changes are local and have not been pushed or deployed.

## Remaining cancellation/refund workflow risks

These are separate from the arithmetic corrections and remain unresolved:

1. `getPoolOrders` auto-expires old unassigned orders by setting legacy `Cancelled` status directly. It does not execute the cancellation/refund handler. A paid order can therefore leave the visible pool without its refund being initiated.
2. Admin generic order-status changes can mark an order cancelled without invoking the refund handler. The refund ledger is a reporting screen, not an issue/retry-refund workflow.
3. The cancellation handler makes the online refund request and writes the wallet/order/transaction state in separate operations. It lacks an atomic cancellation/refund state machine for concurrent requests or failures between those writes. The wallet increment itself has an idempotency guard; this does not make the entire cancellation operation atomic.
4. Provider acceptance of a refund is represented as `Refunded`, without a distinct customer-facing pending/processed/failed refund lifecycle. The payment reconciler focuses on unused payments, not a complete repair process for cancelled paid orders.

A dedicated cancellation service with refund states, idempotent provider operations, reconciliation and admin retry controls is needed to close these risks. Passing calculation tests does not establish that the whole refund lifecycle is complete.
