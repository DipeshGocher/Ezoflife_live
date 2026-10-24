# GST verification

The registered/unregistered demo accounts are available in the configured app database:

| Account | Phone | GST status |
| --- | --- | --- |
| Business customer | 9876510101 | RD, GSTIN 23ABCDE1234F1Z5 |
| Individual customer | 9876510102 | URD |
| Registered vendor | 9876510103 | RD, GSTIN 23FGHIJ5678K1Z2 |
| Unregistered vendor | 9876510104 | URD |

These are synthetic GST identifiers, not verified legal identities. Use the normal customer/vendor login flow. Mock WhatsApp mode uses OTP `123456`; a live provider generates and sends its normal OTP.

On 21 October 2026, the four existing demo accounts were aligned with customer `7777777772` in the active **Nashik-Serene Medows** region (20.0219057, 73.7294076). Both customers' saved addresses and both vendors' shop addresses were aligned too. The seed's original Indore locations are insertion defaults and are not applied to existing accounts.

To align only these four demo accounts with another test customer's saved region:

```sh
node scripts/alignGstDemoRegion.js --customer-phone PHONE
node scripts/alignGstDemoRegion.js --customer-phone PHONE --apply
```

The first command previews the update. Apply validates demo account identities, requires one active reference geofence, saves a location backup in the OS temporary directory, and changes only addresses and coordinates. It preserves GST, service approvals, orders, and balances. A GST customer's orders remain eligible only for GST-registered vendors. Refresh the vendor dashboard after changing locations to reload the available order pool.

From `backend`:

```sh
npm test
npm run verify:gst
npm run verify:gst:display
npm run seed:gst-users -- --dry-run
```

`npm test` includes unit tests, API tests (including the fake Razorpay routing tests), and the GST verification regressions. `verify:gst` runs both `gstBusinessRules.test.js` and `gstDeepAudit.test.js`. Tests use temporary local MongoDB databases and local backend servers; they do not mutate the configured app database or execute real transfers. The deep tests exercise the frontend invoice renderer as well as the backend APIs and socket permissions.

`verify:gst:display` additionally requires installed frontend dependencies, Playwright Chromium, and a frontend production build (`npm run build` in `frontend`). It creates and completes real API orders in a temporary database, then renders the customer copy, vendor Invoice 1, and vendor Invoice 2 in Chromium for scenarios A/B/C, promotion, interstate supply, and changed tax settings. It checks finalized numbers, GSTINs, SACs, line totals, tax splits, frozen identities, wallet/platform shares, and horizontal overflow. Screenshots are written to `/private/tmp/ezoflife-gst-invoice-display`.

The demo-user seed is idempotent, refuses phone collisions, and does not overwrite existing accounts. See [fixes, configuration changes, and live routing setup](../../../docs/GST_FIXES_2026-10-17.md). The [original audit](../../../docs/GST_FLOW_AUDIT_2026-10-17.md) is retained as historical evidence.

With configured service/fee tax rates of 18%, ₹200 service + ₹20 customer platform fee + ₹50 logistics gives:

| Scenario | Invoice 1 service value | Vendor GST | Customer total | Invoice 2 | Vendor net without promotion |
| --- | ---: | ---: | ---: | ---: | ---: |
| A: RD/RD | ₹270 | ₹48.60 | ₹318.60 | ₹82.60 | ₹236 |
| B: URD/RD | ₹270 | ₹48.60 | ₹318.60 | ₹82.60 | ₹236 |
| C: URD/URD | ₹318.60 inclusive | ₹0 | ₹318.60 | ₹82.60 | ₹236 |

For a ₹100 vendor promotion: customer wallet ₹50, Spinzyt promotion share ₹50, Invoice 2 total ₹132.60, vendor net ₹136. Promotional payout is `Invoice 1 − Invoice 2 − wallet credit`, where Invoice 2 contains only Spinzyt's share. Benefits cannot exceed available vendor earnings. Historical finalized invoices are preserved.
