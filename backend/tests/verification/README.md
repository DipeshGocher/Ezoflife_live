# GST verification

The registered/unregistered demo accounts are available in the configured app database:

| Account | Phone | GST status |
| --- | --- | --- |
| Business customer | 9876510101 | RD, GSTIN 23ABCDE1234F1Z5 |
| Individual customer | 9876510102 | URD |
| Registered vendor | 9876510103 | RD, GSTIN 23FGHIJ5678K1Z2 |
| Unregistered vendor | 9876510104 | URD |

These are synthetic GST identifiers, not verified legal identities. Use the normal customer/vendor login flow. Mock WhatsApp mode uses OTP `123456`; a live provider generates and sends its normal OTP.

From `backend`:

```sh
npm test
npm run verify:gst
npm run seed:gst-users -- --dry-run
```

`npm test` includes unit tests, API tests (including the fake Razorpay routing tests), and the GST verification regressions. `verify:gst` runs both `gstBusinessRules.test.js` and `gstDeepAudit.test.js`. Tests use temporary local MongoDB databases and local backend servers; they do not mutate the configured app database or execute real transfers. The deep tests exercise the frontend invoice renderer as well as the backend APIs and socket permissions.

The demo-user seed is idempotent, refuses phone collisions, and does not overwrite existing accounts. See [fixes, configuration changes, and live routing setup](../../../docs/GST_FIXES_2026-10-17.md). The [original audit](../../../docs/GST_FLOW_AUDIT_2026-10-17.md) is retained as historical evidence.

With configured service/fee tax rates of 18%, ₹200 service + ₹20 customer platform fee + ₹50 logistics gives:

| Scenario | Invoice 1 service value | Vendor GST | Customer total | Invoice 2 | Vendor net without promotion |
| --- | ---: | ---: | ---: | ---: | ---: |
| A: RD/RD | ₹270 | ₹48.60 | ₹318.60 | ₹82.60 | ₹236 |
| B: URD/RD | ₹270 | ₹48.60 | ₹318.60 | ₹82.60 | ₹236 |
| C: URD/URD | ₹318.60 inclusive | ₹0 | ₹318.60 | ₹82.60 | ₹236 |

For a ₹100 vendor promotion: customer wallet ₹50, Spinzyt promotion share ₹50, Invoice 2 total ₹132.60, vendor net ₹136. Promotional payout is `Invoice 1 − Invoice 2 − wallet credit`, where Invoice 2 contains only Spinzyt's share. Benefits cannot exceed available vendor earnings. Historical finalized invoices are preserved.
