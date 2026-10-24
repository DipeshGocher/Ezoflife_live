# GST flow audit — 17 October 2026

> Historical audit findings below have been addressed by the follow-up implementation. See [fixes, validation, and live routing setup](GST_FIXES_2026-10-17.md).

## Verdict

The full application flow does **not** yet satisfy the supplied requirements. The earlier 23 checks cover baseline backend behavior and still pass, but they do not establish end-to-end correctness. The deeper review added 17 probes: **2 passed and 15 failed**. Some failing probes share one underlying issue; this is not a count of 15 independent defects.

The most urgent problems are missing app invoice configuration, unauthorized access through sockets, broken customer invoice printing, promotion cancellation/eligibility, and inconsistent payout reporting. Automatic bank routing is not implemented in the inspected payout flow.

## Scope and method

- Traced customer quote, online checkout, order creation, pool filtering, vendor acceptance, invoice preparation/finalization, customer and vendor printing, promotion credit/cancellation, and vendor/admin earnings.
- Reran `npm run verify:gst`: 23/23 passed against a temporary MongoDB and the actual local backend server.
- Added `backend/tests/verification/gstDeepAudit.test.js`: 17 deeper probes against a separate temporary MongoDB and actual local backend APIs, including an unauthenticated socket client.
- Exercised the customer print handler extracted from the real frontend source in a JavaScript VM. The unmodified handler throws. For three later print probes only, a diagnostic shim supplied the missing variable to isolate downstream errors. Those downstream failures are latent until the runtime error is corrected; the audit did not patch the application.
- Read the configured app database's GST settings and active service tax metadata without updating records. No app customers, orders, wallets, promotions, tax settings, or payouts were changed.
- This verifies workspace code and the database selected by `backend/.env`; it does not prove which code revision is deployed on a remote server, and no real payment or bank transfer was executed.

## Requirement-by-requirement result

| Requirement | Result |
| --- | --- |
| RD business customer orders hidden from URD vendor pool | Pass for normal authenticated HTTP paths and vendor-ID spoofing probe |
| URD vendors cannot accept/fulfill another RD customer's order | Baseline checks pass; classification can drift if the customer edits their GST profile before acceptance |
| Two distinct final invoices at completion | Pass with complete invoice configuration; current app configuration blocks finalization |
| A: customer GSTIN; B: vendor GSTIN; C: Spinzyt GSTIN | Baseline backend snapshots pass; customer PDF has a runtime error and snapshot/display inconsistencies |
| Configurable tax, no hardcoded operational rate | Backend database rates work; primary admin GST control writes a different key; active service rates are mixed |
| Invoice 1 visible only to owning customer/vendor | HTTP controls pass; socket privacy fails |
| Invoice 2 visible only to owning vendor | HTTP controls pass; socket privacy fails |
| Fixed platform fee plus separately configured fee taxes in Invoice 2 | Baseline backend calculation passes |
| Net vendor amount = Invoice 1 − Invoice 2, without promotion | Baseline ledger passes; vendor/admin earnings endpoints disagree with the ledger |
| Vendor promotion: 50% wallet, 50% Spinzyt, appropriate invoice display | Happy path passes; eligibility, cancellation, negative payouts, and mixed-promotion metadata fail |
| Actual vendor/Spinzyt account routing | Not implemented in the inspected payout endpoint; only a manual payout record is created |

## Confirmed findings

### 1. Critical — configured app settings prevent final invoice creation

Read-only app configuration inspection found:

| Setting | Observed value |
| --- | --- |
| `gst_percent` | 18 |
| `platform_fee_fixed` | 20 |
| `platform_fee_gst_percent` | 18 |
| `logistics_fee_gst_percent` | 18 |
| `normal_logistics_fee` | 50 |
| Platform GSTIN | Present; format validation passes |
| `invoice_settings.registeredAddress` | Missing/empty |
| `invoice_settings.platformSacCode` | Missing |
| `invoice_settings.logisticsSacCode` | Missing |
| `invoice_settings.promotionSacCode` | Missing |

The top-level GST config validator accepts this incomplete setup, allowing checkout and vendor acceptance. Finalization then requires supplier address and SAC codes. Reproducing these settings in the temporary database made delivery return **503**, initially reporting missing SAC codes for the customer fee lines. Supplying the SAC codes alone would still leave the platform issuer address incomplete.

Sources: `backend/src/utils/gstInvoiceHelper.js:38`, `backend/src/services/invoiceFinalizationService.js:13`, `backend/src/controllers/orderController.js:2075`. The invoice settings UI has the necessary fields; the app database has not populated them.

### 2. Critical — Invoice 2 can be received without authentication over Socket.IO

Socket connections have no token check. The `join_room` handler accepts an arbitrary room ID. Vendor status notifications send the full order, including both invoice documents, to `user_<vendorId>`.

The test connected with **no token**, joined the test vendor's room, triggered delivery through the legitimate vendor API, and received `invoices.platformInvoice`. This violates the vendor-only visibility rule despite correct HTTP invoice authorization. Similar room access exposes customer invoice/status data.

Sources: `backend/src/socket.js:14`, `backend/src/socket.js:17`, `backend/src/controllers/orderController.js:1001`.

### 3. High — customer invoice download crashes; later print logic also differs from the frozen invoice

`handleDownloadInvoice` references `customerGstType`, which is never declared in the component. Executing the handler throws `ReferenceError: customerGstType is not defined`.

After bypassing only that missing variable in the diagnostic VM, three further failures were reproduced:

- It uses `order.invoiceNo`, then invents `SZ-CUST-2026-…`, rather than the finalized `order.invoices.customerInvoice.invoiceNo`.
- An original `ORDER_PLACED` payload can produce a numbered invoice without the backend's delivered/finalized gate.
- It prints raw `order.items` rather than frozen invoice lines. URD inclusive line amounts therefore disagree with the backend invoice totals; express adjustments can also be omitted from item rows. SAC is hardcoded to `9994`.

The print date comes from order creation rather than the finalized invoice date. Several fallback values also reconstruct tax/GSTIN information rather than requiring a finalized invoice.

Sources: `frontend/src/modules/user/pages/OrdersHistoryPage.jsx:174`, `:385`, `:387`, `:410`, `:413`.

### 4. High — vendor promotion eligibility filters are silently discarded

Vendor promotion discovery and acceptance build JavaScript objects with **three `$or` properties**. Only the final property exists at runtime. Minimum-order-value and geofence filters are consequently lost.

The isolated test created a promotion requiring ₹1,000,000 in a different geofence. A ₹318.60 order still qualified, and the customer received ₹50 wallet credit.

Sources: `backend/src/controllers/orderController.js:464`, `:1426`, `:1430`, `:1434`. All independent eligibility clauses need to be preserved, e.g. with `$and` containing separate `$or` clauses.

### 5. High — checkout accepts unapproved promotions

Server pricing loads the client-supplied promotion ID and checks status/date, but not approval, ownership, minimum order value, geofence, usage limit, or applicable service scope.

A pending platform promotion produced a ₹100 checkout discount in the test. A frontend validation step cannot enforce this because the checkout API itself must reject ineligible IDs.

Source: `backend/src/utils/customerOrderPricing.js:158`.

### 6. High — cancelling a vendor-funded promotional order retains cashback

Wallet credit is granted at vendor acceptance, before service completion. Cancellation restores previously spent wallet funds but does not reverse the new promotional credit. An accepted COD order was cancelled successfully and left an extra ₹50 in the customer's wallet.

Repeated placement/acceptance/cancellation can therefore accumulate wallet credit without a completed service. Concurrent-acceptance idempotency alone does not solve this.

Sources: `backend/src/controllers/orderController.js:1528`, `:2239`.

### 7. High — RD invoice classification changes after a customer profile edit

The order captures `isCustomerRD` and a customer GSTIN at checkout, but invoice generation prefers the current User document over that snapshot. The test placed an RD business order, cleared the customer's current GSTIN, then accepted with an RD vendor. Invoice 1 changed to **Scenario B**, losing the original business recipient GSTIN.

Acceptance still blocked URD vendors because it checked `order.isCustomerRD`; the invoice classification and eligibility classification therefore disagree. The recipient identity should follow one explicit immutable order policy.

Sources: `backend/src/controllers/orderController.js:650`, `:1380`, `backend/src/utils/gstInvoiceHelper.js:122`.

### 8. High — earnings screens do not consistently use the invoice payout ledger

The vendor earnings endpoint queries legacy statuses (`Ready`, `Delivered`, `Out for Delivery`) rather than the current uppercase statuses. It also calculates base service plus express surcharge instead of the invoice ledger. In the audit dataset it reported **₹0**, while completed orders' ledger payouts summed to **₹997.40**.

The admin summary uses the ledger only when it is strictly positive. A zero/negative ledger falls back to base service earnings. It reported **₹1,280** for the same dataset instead of **₹997.40**. The difference was ₹282.60: replacing a −₹82.60 ledger with ₹200 base earnings.

Sources: `backend/src/controllers/authController.js:43`, `:48`, `backend/src/controllers/adminController.js:1581`.

### 9. High — no automated vendor/platform bank split exists in the inspected flow

The payout endpoint accepts an amount and transaction ID and inserts a `Completed` payout record. It does not initiate a gateway transfer, split captured funds, reconcile provider settlement, or verify that the recorded amount equals the vendor's invoice-derived payable amount.

Correct ledger arithmetic is therefore insufficient to satisfy “this amount should be routed to the vendor's account; the remainder to Spinzyt.” Bank account verification elsewhere does not execute this routing.

Source: `backend/src/controllers/adminController.js:1744`.

### 10. Medium — admin GST control and invoice pricing use different config keys

The admin pricing screen posts `gst_percentage`; checkout/invoice helpers read `gst_percent`. The former is used by a separate catalog pricing preview, so the two controls can diverge.

The exact admin API request `{ key: 'gst_percentage', value: 12 }` succeeded, but a new checkout's `feeGstPercent` stayed **18**. Changing the value through this control does not update the tax used by the audited checkout/invoice path.

Sources: `frontend/src/modules/admin/pages/PricingConfig.jsx:87`, `:133`, `backend/src/utils/gstInvoiceHelper.js:55`, `backend/src/controllers/masterServiceController.js:161`.

### 11. Medium — a large vendor promotion produces a negative payout

Promotion value is capped at the total customer amount, not the vendor's net earnings after platform/logistics charges. A full-value promotion produced a **−₹82.60** vendor payout. The application does not clearly separate this liability from a transferable payout; the admin summary then substitutes positive base earnings as described above.

Source: `backend/src/utils/gstInvoiceHelper.js:232`, `backend/src/controllers/orderController.js:1450`.

### 12. Medium — vendor promotion overwrites a separate platform checkout discount

A ₹25 platform discount plus a ₹100 vendor-funded promotion initially reconciled the invoice to the amount owed by the customer. Acceptance then replaced `order.discountAmount` with **100**, losing the original **25** checkout discount in order metadata. This causes misleading discount display and creates inconsistent fallback/refund inputs, even when the prepared invoice total remains correct.

Source: `backend/src/controllers/orderController.js:1514`.

## Tax rates and payout formula clarification

The configured default/fee GST is 18%, but the active catalog is mixed: cotton saree 18%, cotton shirt 5%, premium sweater 5% (both Essential and Heritage fields). Checkout intentionally honors item rates. If the supplied requirement means **18% across every service plus fees**, the present catalog does not match it. This audit did not change tax rates or assess legal tax classification.

With all three components configured at 18%, base service ₹200 + customer platform fee ₹20 + logistics ₹50 yields:

- A/B Invoice 1: ₹270 + ₹48.60 GST = **₹318.60**.
- C Invoice 1: **₹318.60 inclusive**, with **₹0 vendor GST**. It retains the agreed checkout price rather than discarding the amount collected.
- Invoice 2 with fixed vendor platform fee ₹20: ₹20 + ₹3.60 + ₹50 + ₹9 = **₹82.60**.
- No promotion: vendor ledger **₹236**.
- ₹100 vendor promotion: wallet ₹50; Invoice 2 includes Spinzyt's ₹50, totaling ₹132.60; vendor ledger **₹136**.

The promotional ledger is `Invoice 1 − Invoice 2 − customer wallet credit`. That extra deduction funds the customer's wallet, because Invoice 2 contains only Spinzyt's share. The user's simple `Invoice 1 − Invoice 2` formula applies exactly to non-promotional orders; using it unchanged for promotional orders requires another explicit source for wallet funding.

## Additional code-reviewed reliability risks

These are not included in the 17 executed deep probes:

- Order claim and customer wallet credit are separate database writes. A crash after claiming the order can leave `walletCreditStatus=PENDING`; acceptance retries reject already-assigned orders, and no repair worker was found for that state.
- Invoice finalization locks do not have a stale-lock recovery path. A process crash while `FINALIZING` can leave the order unable to finalize on retry.
- Finalization validates presence of fields but does not validate that line totals, invoice totals, collected amounts, and ledger allocations reconcile.
- GST registration checks validate string format, not external registration status. The database audit confirmed format/config presence only.

## Remediation order

1. Complete and validate invoice issuer/SAC settings before checkout/acceptance; authenticate sockets and enforce room ownership.
2. Make customer printing consume finalized Invoice 1 exclusively, including invoice number/date, frozen lines, SAC, and state tax details.
3. Centralize promotion eligibility; preserve checkout discounts separately; reverse or defer wallet credit on cancellation; make settlement recoverable.
4. Use immutable order party snapshots consistently and one invoice-derived settlement ledger in every earnings/reporting endpoint.
5. Unify the admin/backend GST configuration keys and explicitly confirm desired catalog rates.
6. Implement and test actual vendor/platform transfer routing separately from manual payout recording.

## Reproduce

From `backend` with backend and frontend dependencies installed and local `mongod` available:

```sh
npm run verify:gst
node --test --test-reporter=spec --test-timeout=120000 tests/verification/gstDeepAudit.test.js
```

The second command intentionally exits nonzero because it asserts the desired behavior and reproduces the remaining failures. It is separate from the default regression suite. This audit adds tests/reporting only; it does not change application logic or app database records.
