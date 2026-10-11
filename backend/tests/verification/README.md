# GST business-rule verification

Four synthetic accounts have been added to the configured app database. Their GSTINs are test identifiers, not verified legal identities. Both vendors are approved, profile complete, colocated with the customers in Indore, and support the three currently active master services. No app orders, promotions, wallet balances, payment accounts, or tax settings were changed.

| Account | Phone | GST status |
| --- | --- | --- |
| Business customer | 9876510101 | RD, GSTIN 23ABCDE1234F1Z5 |
| Individual customer | 9876510102 | URD, no GSTIN |
| Registered vendor | 9876510103 | RD, GSTIN 23FGHIJ5678K1Z2 |
| Unregistered vendor | 9876510104 | URD, no GSTIN |

Use the normal customer/vendor login flow. Mock WhatsApp mode uses OTP `123456`; a live provider sends its generated OTP normally. The seed does not add an authentication bypass or send messages.

From `backend`:

```sh
npm run seed:gst-users -- --dry-run
npm run seed:gst-users
npm run verify:gst
```

The seed checks phone collisions before writing and only inserts missing demo users. It never overwrites existing accounts. The acceptance checks use a temporary local MongoDB and real backend API; they do not use the app database. They are a separate verification command so known business-rule failures do not masquerade as passing regression tests. A nonzero exit means the requested requirements are not fully implemented.

## Corrected behavior

Validation: all 23 GST acceptance checks pass; all 129 backend unit checks pass; 75 invoice/payment/promotion/authorization/order lifecycle regression checks pass, plus a final payment run of 25 checks including paise collection. The frontend production build passes.

The initial verification found 7 failing checks out of 19. The fixes cover:

- Invoice 1 includes configured GST on customer platform and logistics fees as well as catalog-configured service GST. Checkout persists the fee tax rate; later config changes cannot reprice paid orders. Configured zero rates remain zero.
- URD vendors issue a zero-GST invoice for the agreed inclusive customer price. The amount previously shown as checkout tax is included in the service value and allocated to invoice lines; it is not charged again or discarded.
- Customer totals, wallet amounts, and online collection retain paise rather than rounding to whole rupees.
- Invoice 2 uses `platform_fee_fixed`, independent of percentage-based customer pricing, and separately configured platform/logistics tax rates.
- The order pool derives vendor identity from the authenticated token, preventing a URD vendor from supplying an RD vendor's ID.
- Only the owning customer/vendor can access Invoice 1; only the owning vendor can access Invoice 2. Admin order responses strip invoice documents, and admin order invoice download/print controls have been removed. Admin invoice settings may still show synthetic layout samples.

For base service ₹200, customer platform fee ₹20, logistics fee ₹50, and 18% tax rates:

| Scenario | Invoice 1 service value | Invoice 1 GST | Customer total | Invoice 2 | Vendor payout, no promotion |
| --- | ---: | ---: | ---: | ---: | ---: |
| A: RD/RD | ₹270 | ₹48.60 | ₹318.60 | ₹82.60 | ₹236 |
| B: URD/RD | ₹270 | ₹48.60 | ₹318.60 | ₹82.60 | ₹236 |
| C: URD/URD | ₹318.60 inclusive | ₹0 | ₹318.60 | ₹82.60 | ₹236 |

Completed invoices remain frozen. Existing finalized documents and app database balances are not rewritten by this change. Legacy paid checkouts without the new fee-tax snapshot retain their original tax terms.

## Promotion and bank-routing limits

For a ₹100 vendor-funded promotion, Invoice 1 shows ₹50 wallet credit, Invoice 2 includes ₹50 Spinzyt share, and the wallet is credited once. The current ledger deducts both shares from the vendor: `vendor payout = Invoice 1 - Invoice 2 - wallet credit`, where Invoice 2 already includes Spinzyt's ₹50 share. This conserves the collected amount and funds the wallet, but adds a wallet deduction to the simple formula supplied for non-promotional orders.

These checks use COD orders and do not execute bank transfers. The inspected payout controller records a supplied transaction ID as a completed payout; it does not initiate the vendor/Spinzyt bank split. Real account routing is therefore not verified by these tests.

This change fixes the financial calculations and invoice access controls described above; payment-provider bank routing is outside these fixes.
