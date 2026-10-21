# Payment, GST and bank settlement verification — 17 October 2026

## Actual Razorpay test checkout: passed

Using the user's updated test credentials, an actual Razorpay Standard Checkout was completed with the provider's netbanking demo Success page. This verification used the real backend with a temporary local database, not the fake gateway. No RazorpayX account number or vendor Route account was needed for collection.

| Evidence | Result |
| --- | --- |
| Provider order | `order_Tov5C2ZYQnFG7w` |
| Provider payment | `pay_Tov6lAtrQbjGJq` |
| Provider payment readback | `captured`, INR 31860 paise |
| GST scenario | RD customer / RD vendor |
| Customer invoice | `SZ1/26-27/100001`, finalized, ₹318.60 |
| Platform invoice | `SZ2/26-27/100001`, finalized, ₹82.60 |
| Vendor net payable | ₹236 |
| Forged callback signature | Rejected before order creation |
| Reuse of the captured payment for a second order | Rejected |
| Vendor transfer | Not initiated; Route remained disabled |
| Configured app database | Unchanged |

The sequence was real provider checkout → signed callback → backend payment verification/capture → paid order → vendor acceptance → delivery → both finalized GST invoices. The temporary database and browser were removed afterward. A sanitized result is saved at `/private/tmp/ezoflife-provider-checkout-result.json`.

This verifies an actual provider test-mode collection and RD/RD invoice integration. All GST combinations and invoice displays are additionally covered by the isolated suites below. It does not verify a live collection, vendor transfer, real bank credit, or delivery of provider webhooks to a deployed endpoint.

## Verified in isolated integration tests

The payment/routing suite now has 13 tests using the real backend and a local fake Razorpay provider. The flow creates a checkout, verifies captured payment/signature, consumes the payment once, creates an order, accepts it with an eligible vendor, delivers it, finalizes both invoices, and routes the invoice-derived vendor net.

- A (RD/RD), B (individual/RD), and C (individual/URD): customer collection ₹318.60, platform invoice ₹82.60, vendor transfer ₹236. C retains the inclusive collected total with 0% vendor GST.
- ₹100 vendor promotion: customer wallet ₹50, platform invoice ₹132.60 including platform share ₹50, vendor transfer ₹136. All allocations conserve the ₹318.60 collection.
- Online-plus-wallet funding, missing destinations, admin-only destination/transfer controls, duplicate/concurrent attempts, lost responses, and manual payout overlap are covered.
- Refunded and underfunded captures cannot be transferred.
- Queued transfers are fetched until processed. A processed Route transfer is tracked separately from bank settlement; `pending`, `on_hold`, and `settled` are persisted alongside the recipient settlement ID.
- The scheduled reconciler follows processed transfers through bank settlement using fetch-only requests. Reversals are flagged for manual review; the app does not send an automatic replacement transfer.
- Admin payment summaries expose pending bank settlements and review states. Vendor history and exported statements distinguish transfer processing from bank settlement.

Razorpay's [Route transfer/settlement fields](https://razorpay.com/docs/api/payments/route/fetch-transfers-for-a-settlement/) distinguish transfer processing from settlement. The integration records the provider's reported bank-settlement state; independent bank-statement confirmation is separate evidence.

Full regression verification after these changes passed: **130 unit tests, 1,049 API tests, and 47 GST regressions (1,226 backend tests total)**. All **74 frontend tests** and the frontend production build also passed.

## Actual configured environment: not verified for real transfers

Read-only checks found:

| Check | Result |
| --- | --- |
| Razorpay key mode | Test |
| Key and secret present | Yes |
| Authenticated Orders API | HTTP 200 |
| Route settlement-read API | HTTP 400: requested URL not found |
| Transfer-by-ID availability probe | HTTP 400: requested URL not found |
| Linked-account-by-ID probe | API responds: deliberately nonexistent ID rejected |
| Route enable flag | False |
| Saved vendor linked accounts | 0 |
| Eligible finalized paid online orders | 0 |
| Webhook signing secret configured | No |
| Invoice issuer address | Temporary address authorized by user |

The Route read response does not establish whether the product is activated; verify activation/access in the Razorpay dashboard or with Razorpay support. No account IDs, secret keys or customer payment records are printed in this report. No real transfer was initiated, and actual bank credit has not been confirmed.

The user selected **Razorpay test mode first**. Actual provider checkout/collection has now passed as recorded above. A genuine test linked account and working Route API access are still required for the transfer portion. The global Route flag remains disabled. The availability results in this table are the earlier setup snapshot, before the user's latest test-key update.

## Remaining real-provider verification

1. Confirm Route API availability in Razorpay test mode and configure a genuine test linked account through Admin → Payments → Vendor Payouts → Razorpay Route.
2. Configure the webhook signing secret securely in the backend environment and the corresponding payment webhook endpoint in Razorpay. Enable Route only when ready: the reconciler may process existing eligible unsettled orders.
3. Complete an online test checkout and delivery. Check both invoices, the transfer amount, provider transfer status, and separate bank-settlement status. Test mode does not move real bank money.
4. For a live bank-credit check, use activated live credentials and a verified live linked account. Select the specific vendor/order and approved amount before initiating the transfer; confirm the provider settlement reference and receipt with the bank.
5. Replace the temporary registered address in Admin Invoice Settings before issuing production invoices. Demo GSTINs verify software behavior, not legal registration.

Run the isolated routing checks from `backend`:

```sh
node --test --test-reporter=spec --test-concurrency=1 tests/api/gstSettlement.test.js
```

Run all backend regressions with `npm test`, and the 18 invoice browser renders with `npm run verify:gst:display` after building the frontend.
