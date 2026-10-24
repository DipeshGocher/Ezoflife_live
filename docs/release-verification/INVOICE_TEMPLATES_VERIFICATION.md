# Invoice templates: release verification

24 October 2026. Source starts from GitHub main `5b35b44`. This change implements the five invoice references approved in the conversation: three vendor-to-customer variants and two Spinzyt-to-vendor variants. The registered-vendor Invoice 2 layout covers both registered and unregistered customers.

Customer invoices show exactly one GST identity: customer for registered/registered, vendor for registered/unregistered, Spinzyt in the header for unregistered/unregistered. Invoice 2 shows only Spinzyt GST in the header. Registered vendors have the Service GST row; unregistered vendors omit it. Both invoice purposes keep their own finalized document numbers/dates.

The new display snapshots preserve recorded services, taxes, fees, customer totals and payouts without changing the payment formula or settlement policy. Historical reads assemble available display facts without rewriting finalized invoice documents. Preview/print and PDF downloads use the approved layouts.

## Verification results

| Check | Result |
| --- | --- |
| Backend unit suite | 163 passed |
| Full API/integration/socket suite | 1,174 passed; zero failures/cancellations |
| Tax business rules/deep audit | 47 passed |
| Chromium tax invoice display | Passed across scenarios, promotions, interstate and configurable taxes |
| Frontend unit/component suite | 261 passed across 33 files |
| Clean pnpm frozen install | Passed using pnpm 10 |
| Tests with pnpm-locked dependencies | 261 passed |
| Production builds (npm and pnpm) | Passed; existing bundle-size and dynamic-import warnings |
| Backend/shared syntax and diff whitespace | Passed |
| Focused invoice lint | Passed |
| Full frontend lint | Existing backlog remains: 421 errors, 95 warnings |
| Production-build browser regression | 106 passed; zero failures or skips (mobile and desktop, compiled production build) |

The source fingerprint in [invoice-templates-source-fingerprint.json](invoice-templates-source-fingerprint.json) identifies the tested source and dependency locks. Test stacks use disposable local MongoDB databases and disabled external messaging/payment-routing providers. Live Google Maps browser tests are excluded. Prior dependency advisories, live-provider/staging acceptance and load/volume limitations remain; this report does not claim production acceptance or successful Vercel deployment.

These changes are included in the invoice template release commit on main. A GitHub push can trigger Vercel; live deployment success must be checked separately.
