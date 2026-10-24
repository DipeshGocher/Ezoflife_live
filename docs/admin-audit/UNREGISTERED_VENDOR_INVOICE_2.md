# Invoice 2: Spinzyt → unregistered vendor

Applies only to orders with both an unregistered vendor and an unregistered customer (scenario C / URD_URD). Implements the reference supplied on 24 October 2026.

The invoice uses Spinzyt's grey branded banner with Spinzyt GST in the header, Invoice 2's own number/date, vendor ID/name, order number, blue service table, service subtotal, customer charge, logistics/platform fees and their taxes, and net vendor payout. Customer identity fields and a vendor GST field are absent. No Service GST row is introduced.

Preview, print/save and the admin vendor invoice PDF use this layout for the matching scenario. Registered-vendor combinations now use the separately supplied [registered-vendor reference](REGISTERED_VENDOR_INVOICE_2.md), with a Service GST row. The original tax charge lines, tax breakdown, addresses and total platform charges remain available below the reference table.

New Invoice 2 records snapshot the service lines, service types, customer charge, vendor identity and payout alongside the existing finalized fee invoice. Historical records use stored Invoice 1 and ledger facts when those presentation fields do not exist. Missing historical amounts remain labelled “Not recorded”. Fee calculations, customer payment totals, payout policy and finalization numbering are unchanged.

Verified: 259 frontend tests, 162 backend unit tests, 47 tax-rule/deep-audit tests, 4 focused API tests and Chromium invoice display verification pass. Production build and focused lint pass. Desktop and mobile reference previews have no horizontal overflow at widths 320, 390 and 768. Included in the invoice template release on main; deployment is tracked separately.
