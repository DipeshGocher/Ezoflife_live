# Vendor-to-customer invoice templates

Updated 24 October 2026 to the three supplied references. Customer print documents, admin/vendor customer-invoice previews and customer PDF downloads use the same GST display decision.

| Vendor | Customer | Only GST number displayed | Position |
| --- | --- | --- | --- |
| Registered | Registered | Customer GST | Customer details |
| Registered | Unregistered | Vendor GST | Vendor details |
| Unregistered | Unregistered | Spinzyt GST | Company header banner |

The other parties’ GST numbers are absent from the rendered customer copy. Spinzyt GST is absent from the header in the first two combinations. The unregistered-vendor template omits the Service GST row; stored logistics/platform tax rows remain as supplied. The matching unregistered-vendor Invoice 2 reference is documented separately in [Invoice 2 notes](UNREGISTERED_VENDOR_INVOICE_2.md); registered-vendor Invoice 2 combinations use [their supplied reference](REGISTERED_VENDOR_INVOICE_2.md).

All three layouts use the patterned grey company banner, logo, blue service table, grey financial rows and net vendor payout. Addresses, tax splits and place of supply remain below the table. Configured business/contact details remain editable.

Amounts come from finalized invoice lines and stored fees/payouts. Presentation facts are captured for all three scenarios. Historical reads assemble available presentation facts from stored finalized invoices without changing their invoice numbers, financial amounts or saved documents. Missing historical amounts are labelled “Not recorded”. No payment calculation, tax rate, fee or settlement policy was changed.

Verification: 254 frontend tests, 161 backend unit tests, 47 tax-rule/deep-audit tests and 16 focused API tests passed. The production build and focused lint passed. Chromium verifies exactly one correct GST number and its position in all three layouts, mobile overflow, invoice finalization, frozen amounts and identity handling. Included in the invoice template release on main; deployment is tracked separately.
