# Invoice 2: Spinzyt → registered vendor

Implements the reference supplied on 24 October 2026 for both registered-vendor combinations: registered customer (A / RD_RD) and unregistered customer (B / URD_RD).

Both use the Spinzyt banner with only Spinzyt GST, Invoice 2's own number/date, vendor ID/name, order number, blue service table, service subtotal, Service GST, amount charged to the customer, logistics/platform fees and their taxes, and net vendor payout. Customer identity details, customer GST and vendor GST are absent from this invoice's rendering. The unregistered vendor/customer version retains the same layout without the Service GST row.

Preview, print/save and vendor-invoice PDF downloads use this template. New Invoice 2 snapshots capture service lines, service types, service subtotal, service tax, customer charge and vendor payout. Historical records display the available stored Invoice 1 and ledger facts without rewriting finalized documents. Invoice 2's actual fee total, charge lines and tax split remain below the reference table. Payment calculations, fees, taxes, settlement rules and invoice numbering remain unchanged.

Verification: 261 frontend tests, 163 backend unit tests, 47 tax-rule/deep-audit tests, 4 focused API tests and Chromium invoice display verification passed. Production build and focused lint passed. Both registered-vendor combinations were checked at desktop and mobile widths, with exactly one Spinzyt GST number in the header and no horizontal overflow. Included in the invoice template release on main; deployment is tracked separately.
