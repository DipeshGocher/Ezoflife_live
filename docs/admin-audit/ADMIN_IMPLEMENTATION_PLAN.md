# Admin panel implementation plan

> **Pre-production verification — 24 October 2026:** Functional suites and production-style browser tests pass after targeted fixes, but the production push remains on hold for dependency advisories, the lint backlog, low full-source frontend coverage and staging/provider/pricing acceptance. See [PRODUCTION_READINESS.md](../release-verification/PRODUCTION_READINESS.md) for results and release blockers. No push or deployment was performed.

> **Supplier analytics — 24 October 2026:** Added a dedicated Supplier overview with current supplier/account counts, entity-type chart, supply-order workload, selected-period booked value and supplier order summaries. Customer-only filtering now explains why supplier analytics are hidden and provides an All-channel shortcut. Permission boundaries and payment behaviour are unchanged. See [DASHBOARD_DELIVERY.md](DASHBOARD_DELIVERY.md).

> **Vendor list correction — 24 October 2026:** Registered Vendor filtering now includes Proprietorship and Partnership as well as company/franchise types, with legacy GST fallback. Explicit Unregistered/Local accounts remain separate. Sidebar category changes reset pagination and failed user-list requests expose retry controls. See [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md) for validation.

> **Business overview restored — 24 October 2026:** Added combined customer/supply transaction values, current partner and client types, recorded order events and a brief financial overview to the dashboard. These sections use real scoped records; labour analytics and the excluded reconciliation module remain removed. Payment behaviour is unchanged. See [DASHBOARD_DELIVERY.md](DASHBOARD_DELIVERY.md) for definitions and validation.

> **Dashboard visual correction — 24 October 2026:** The operational dashboard now includes a real GMV trend area chart and active-order breakdown bar chart, four compact cards, a neutral background and aligned filters. Explanatory notes are collapsed; the labour pipeline remains removed and Hire Talent stays available. Chart totals use the same scoped records as the cards. See [DASHBOARD_DELIVERY.md](DASHBOARD_DELIVERY.md) for validation.

> **Labour scope clarification — 24 October 2026:** Remove labour pipeline/management analytics only from the admin dashboard. **Hire Talent remains required.** Vendor/supplier hiring screens, requests, specialist APIs, Careers and stored records are retained. The dashboard no longer requests or returns labour pipeline or talent-requisition analytics.

> **Latest dashboard delivery — 24 October 2026:** The dashboard now uses scoped operational totals, recorded rider assignments, precise daily GMV and two-hour pickup/payment queues. Its extra analytics tabs are removed. Filters persist through polling and stale requests are ignored. See [DASHBOARD_DELIVERY.md](DASHBOARD_DELIVERY.md) for the current scope, validation and remaining provider/historical-data limits. Original phase descriptions below are historical. Current payment behavior is preserved.

> **Latest scope update — 24 October 2026:** The user removed the standalone **Health & SLA**, **Reports & Reconciliation**, and **Vendor Ranking** sections from the requested admin scope. Their navigation/pages and APIs are withdrawn; the operational monitor and marketplace rank adjustments are disabled. Earlier delivery descriptions below are historical and must not be read as requests to restore these features. Existing stored data is retained. The new-admin geofence field now uses a searchable multi-select dropdown with the same saved restriction-array contract.

Prepared on 23 October 2026 from the [BRD audit](ADMIN_BRD_AUDIT.md). The plan covers all **34 partial or missing requirements** in the 47-row admin assessment, plus the release blockers discovered while tracing those workflows. The **13 code-supported requirements** require regression acceptance rather than wholesale redevelopment. The [structured matrix](requirements.json) maps every requirement to a delivery package.

The invoice editor expansion has been implemented in this workspace. Implementation of the backlog has now started following the user’s instruction, in tested increments. Batch 1 connects real admin order details and adds user search. Batch 2 restores customer/vendor downloads in the last Orders column on both tabs and adds current-account and HTTP ticket permission checks. Batch 3 authenticates socket connections, authorizes room subscriptions and event delivery, and preserves frontend reconnect subscriptions. Batch 4 adds the admin Audit History screen, durable action-attempt/outcome records, account/action scope enforcement and blocked-partner visibility. Batch 5 secures profile/document/onboarding ownership, preserves scoped walk-in address editing and adds user-linked service-order/support history; Batch 6 applies assigned-area scope before dashboard/report totals and filter choices, protects unallocated vendor ledgers and scope-defining area edits, and adds explicit report errors/retry; see [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md). Exact invoice reference matching remains pending the reference file. Production deployment, live transfers and infrastructure migration are outside this local implementation batch.

## Latest combined implementation pass

The user requested the remaining batches together and confirmed that payment behavior and the current payment flow must stay unchanged. The combined pass adds dashboard window/refresh corrections, health/SLA exceptions, support assignment, recorded dispute evidence, immutable customer invoice issuance, vendor visibility ranking, activation refresh, B2B/module/notification permission coverage, pricing-input snapshots and read-only financial/TAT/density reports. Existing external payout recording now validates positive amounts and handles repeated transaction references idempotently; it does not initiate transfers or change settlement calculations.

**The backlog is not fully closed.** See the package-by-package [remaining status](REMAINING_PACKAGE_STATUS.md) and [validation record](IMPLEMENTATION_PROGRESS.md). Exact invoice reference matching, cross-renderer issuance consolidation, authoritative quote/commission governance, financial ledgers/provider reconciliation and external notification/provider acceptance remain explicit work. These are not silently marked complete because a related page or endpoint was added. The original 47-row audit remains the historical baseline.

## Dashboard verification and correction on 24 October 2026

The initial review reproduced 12 discrepancies in 17 isolated API checks and a browser-confirmed refresh/filter defect. That evidence remains in [DASHBOARD_VERIFICATION.md](DASHBOARD_VERIFICATION.md) as a historical baseline. The dashboard has now been rebuilt around the operational requirements; its extra analytics tabs are removed and its cards/queues use a separate canonical contract. See [DASHBOARD_DELIVERY.md](DASHBOARD_DELIVERY.md) for current definitions, validation and historical-data/provider limits. Health monitoring and the other explicitly excluded standalone sections remain withdrawn. This supersedes the earlier five-tab dashboard acceptance status without claiming that the unmodified original BRD or every broader admin backlog item is complete.

## Delivery principles

1. Use real records and canonical status/timestamp definitions before adding new visual summaries.
2. Resolve identity, pricing, permissions and financial limits on the server. UI visibility is a convenience, not access enforcement.
3. Make every monetary operation idempotent, auditable and reconcilable with its provider result.
4. Freeze transaction prices and document details when issued. A settings change applies to new transactions according to an explicit effective-time policy.
5. Test the business requirement through UI, API and storage. A route, icon, field or toast is not an acceptance result.
6. Keep the current filter work and existing admin styling. Implement corrections with additive migrations and bounded compatibility handling.

## Product decisions to resolve early

| Decision | Why it matters | Proposed working direction pending product confirmation |
| --- | --- | --- |
| Infrastructure fidelity | BRD names AWS serverless, RDS and S3, while code uses Express, MongoDB and Cloudinary | Deliver functional corrections on the current stack; record a formal deviation or scope a separate migration. No infrastructure migration is included in these estimates. |
| Price formula and units | Current editors, catalog preview and order creation use competing keys and surcharge placement | Document worked examples for Essential/Heritage, normal/Express, logistics, tax, discounts and thresholds; approve one formula and key schema before implementation. |
| Override precedence | BRD requires row override over tier default | Resolve vendor-service override, then vendor override, then tier default. Add a category layer only if explicitly agreed; do not assume area-price override is commission override. |
| Advance payment | BRD requires 5% pickup advance; existing defaults often use 100% | User confirmed on 24 October: preserve current payment behavior and flow. Do not migrate to 5%; keep existing timing/percentage and placed orders unchanged. |
| Rider metric | Provider riders are not equivalent to local online Rider accounts | Count distinct provider assignments in active trip legs; define double-counting and stale-status rules. |
| Service deadlines | BRD includes two-hour pickup/payment and 24-hour normal processing conditions | Derive deadline from the relevant event, not `updatedAt`; define pause/cancel exceptions and Express deadlines. |
| Invoice reference and issuer | Reference is absent; current renderers represent differing document purposes | Obtain the template; identify customer invoice, platform-to-vendor fee invoice and supplier-to-vendor invoice separately; preserve actual issuer/recipient identities. |
| Refund and credit authority | Delivered-order disputes need limits and evidence | Define permitted roles, full/partial refund limits, cash handling, approval thresholds and credit-expiry policy with the business. |
| Settlement policy | Local Weekly selection is not a persisted payout policy | Confirm eligible statuses, commission/tax treatment, COD netting, cutoff timezone and weekly/monthly cycles. |

Resolve formula and payment decisions before WP06/WP10 financial acceptance. Receipt of the invoice reference blocks only exact visual matching; it need not stop backend correctness or the remaining audit work.

## Work packages and coverage

Estimates below are engineering days for implementation and focused tests, assuming familiarity with this repository. They are planning ranges, not commitments. Provider account onboarding, production approvals, data cleanup outside this repository and a literal AWS migration are excluded.

| Package | Outcome | Requirement coverage | Priority | Dependencies | Engineering days |
| --- | --- | --- | --- | --- | ---: |
| WP00 | Regression acceptance for existing features | AUTH01, U01–U04, U09, C01, C11, S01, S03–S05, R05 | Ongoing | Test fixtures | Included in relevant packages |
| WP01 | Enforced account, admin and support permissions | U11; cross-cutting release blockers | P0 | Access rules | 8–12 |
| WP02 | Real order detail and consistent issued invoices | U08; invoice request and P0079 | P0 | WP01; reference for visual fidelity | 6–10 |
| WP03 | Correct and refreshed operational dashboard | D01–D03, D09 | P1 | WP01; canonical events | 4–7 |
| WP04 | Health monitoring and actionable SLA alerts | D04–D08; P0260–P0261 | P1 | WP03; provider telemetry | 5–8 |
| WP05 | User audit search and live vendor activation | U05–U07, U10 | P1 | WP01, WP02 | 4–7 |
| WP06 | One authoritative price and commission policy | C02–C08, C12 | P0 | Agreed formula; WP01 | 10–16 |
| WP07 | Vendor ranking adjustments | C09–C10 | P2 | WP06; marketplace sort policy | 4–6 |
| WP08 | Assigned support tickets | S02 | P1 | WP01, WP05 | 4–6 |
| WP09 | Custody evidence and financial dispute resolution | S06–S09 | P0 | WP01, WP02, WP06 | 8–13 |
| WP10 | Settlement and COD reconciliation | R01, R04 | P0 | WP01, WP06, WP09 ledger contract | 8–13 |
| WP11 | Vendor TAT and order-density reports | R02–R03 | P2 | WP02, WP03 | 6–10 |
| WP12 | Lifecycle integration and release acceptance | Cross-cutting notifications, custody and regression gates | P0 release gate | All relevant packages | 6–10 |
| **Total** | **Functional admin completion on current stack** | **All 34 open requirements** | | | **73–118** |

A 25% contingency for integration and data differences gives approximately **91–148 engineering days**. With two developers and shared QA, a reasonable initial calendar window is **10–16 weeks**, subject to dependencies and provider access. A single developer would require a materially longer schedule. Re-estimate after WP01 and WP06 discovery; do not derive delivery dates from requirement percentages.

## WP01 Enforce permissions and account lifecycle

**Problem:** database status changes do not consistently invalidate session actions; some ticket reads and socket subscriptions lack resource checks. Read-only and geofence permissions are applied on only some paths.

**Implementation**

- Centralize authenticated identity resolution and require an existing, active account. Explicitly reject deleted users/admins and blocked accounts. Consider a session/auth-version field to invalidate issued sessions when roles or status change.
- Consolidate `verifyUser`, `verifyAdmin` and mixed-role middleware on shared account checks. Apply read-only permissions to every mutation, including routes outside `/admin` and GET endpoints that currently perform repair/seeding writes.
- Define resource policies for customer orders, vendor orders, ticket ownership, evidence, refunds, wallet credits, payout records, configuration and exports. Apply geofence limits to list, detail, aggregate and export paths consistently.
- Authenticate Socket.IO connections and authorize each ticket/order room membership. Derive message sender and ticket customer from identity; ignore forged role/sender IDs from untrusted request bodies.
- Add append-only administrative audit events for approvals, blocks, settings, prices, ranks, assignments, financial decisions and access failures. Record actor, scope, target, reason and correlation ID without logging secrets or OTPs.

**Acceptance**

An old JWT cannot act after block/delete; a customer cannot read or post to another customer’s ticket; a user cannot join another ticket room; a read-only admin cannot write through any route family; scoped admins cannot retrieve out-of-scope individual records or aggregate/export data. A normal authorized request still works. Test these as negative and positive API/socket cases.

**Main code:** `authMiddleware.js`, `ticketRoutes.js`, `ticketController.js`, `socket.js`, resource route middleware and controller queries. Additive fields may include `authVersion` and an `AdminAuditEvent` model.

## WP02 Use real orders and preserve invoice facts

**Problem:** the admin order detail page renders a sample; multiple independent invoice implementations can diverge.

**Implementation**

- Replace the hardcoded memoized order with an authorized API lookup. Reuse canonical customer/vendor snapshots, order items, payment records, custody events and actual dates. Handle missing/deleted related users using stored transaction snapshots.
- Define document types explicitly: customer service invoice, platform commission invoice, B2B supply invoice. Build one normalized document-data contract for each type, with actual issuer, recipient, units, rate/line amount distinction, tax and payment status supplied by recorded transaction facts.
- The expanded settings editor is already delivered. Finish this package by integrating those details with immutable issued invoice records containing invoice number, issued date, template version, settings snapshot, order snapshot and totals. Allocate numbers atomically rather than slicing an order ID or hardcoding a year.
- Obtain the user’s reference. Compare header, issuer/recipient blocks, column widths, line items, totals, terms and footer; implement the supplied visual layout without copying sample transactional values into live invoices.
- Generate previews and downloads from the same document data. Remove fabricated payment claims and fallback recipient/address/GST values. Consolidate duplicate renderers carefully; preserve document-purpose differences.
- Test long business names and addresses, multiline terms, zero/decimal quantities where supported, missing optional fields, several pages of items, legacy configuration and special HTML characters.

**Acceptance**

Two order IDs show their two actual datasets. Totals and line amounts match recorded transactions. Failed or forbidden lookups never display a sample as fallback. Re-downloading an issued invoice after a branding/pricing change preserves its originally issued facts. Customer, vendor and admin versions agree for the same document type. Reference matching is visually checked after the attachment is supplied.

**Main code:** `AdminOrderDetail.jsx`, `InvoicePrint.jsx`, `B2BInvoicePrint.jsx`, `Orders.jsx`, `OrdersHistoryPage.jsx`, shared invoice settings/data utilities and a new invoice registry.

## WP03 Correct operational metrics and refresh

**Implementation**

- Create a metrics contract defining active statuses, trips in progress, daily GMV, cancellations, refunds, booked versus collected revenue, timezone and filters. Default the landing “today” panel to the business day rather than silently using 30 days.
- Build filters with intersection rules rather than overwriting predicates. Preserve deadline-specific time windows and intersect them with the reporting window. Do not apply user registration-date constraints to the population of all users placing orders within the selected period.
- Apply channel, geography, geofence, permissions and time range to every chart and summary, including monthly aggregates. Do not replace an explicit pincode predicate with a separate geofence set without intersecting it.
- Count trips from provider assignment/leg events, not unrelated online local users. Show unknown/stale provider data distinctly from zero trips.
- Add bounded polling or authenticated event-driven invalidation with a periodic reconciliation refresh. Cancel stale requests, show last successful refresh and avoid request storms during filter changes.
- Fix sidebar ticket/dispute counts to use actual Ticket categories/statuses rather than importing nonexistent models.

**Acceptance**

A seeded dataset with delivered/cancelled/active orders, two locations, mixed channels and users registered outside the period yields agreed totals. Every filtered widget agrees with its detail list. A newly created/completed order updates without page reload inside the agreed freshness window. Request failures show stale/unknown state, not fabricated zeros.

## WP04 Measure health and manage SLA exceptions

**Implementation**

- Add provider health samples for server/database readiness, WhatsApp and payment gateway connectivity/latency. Use safe read-only probes or observed request timing; do not send messages or charge accounts merely to test health.
- Record measured-at time, status, latency distribution, provider mode and recent failures. Distinguish mock from live, degraded from unavailable, and unknown from healthy. Limit retention and probe frequency.
- Introduce explicit events/deadlines: placed/pickup due, handover, processing started, ready, delivered and paid. A generic `updatedAt` change must not reset a business SLA.
- Build delayed-pickup and unpaid-delivery rules using the BRD’s two-hour thresholds and a normal-processing rule at 24 hours, with agreed Express exceptions.
- Persist alerts with deduplication keys, first/last occurrence, owner, acknowledgement, resolution and related order. Link directly to the actual order or financial case.
- Add durable scheduling, retries and idempotent notifications. Build payment reminder and vendor overdue notifications using configured templates and recipient action links.

**Acceptance**

Clock-controlled tests demonstrate no premature alert, one alert at the threshold, no repeated notification storm, and automatic resolution when paid/picked up. A failed gateway changes its health display without affecting unrelated business data. A mock provider is visibly identified.

## WP05 Complete user auditing and vendor activation

**Implementation**

- Add server-backed normalized phone/email search with case-insensitive email matching and bounded pagination. Include blocked users/vendors in an explicit status-filtered audit view so they can be reviewed and unblocked.
- Provide a user detail route with identity, saved addresses, actual order history, active/closed tickets and relevant status-change history. Link all sections by immutable user ID rather than name.
- On final vendor approval, emit a role-change event after successful persistence, refresh account/session state and provide a vendor-mode redirect or sign-in refresh path. Send the required activation notification through the selected provider.
- Keep initial document approval distinct from final activation. Provide revision and rejection reasons in the recipient’s session and retain an audit trail.

**Acceptance**

Search finds a customer/vendor by phone and email; blocked vendors remain auditable; details show only that user’s records. An already-open customer session changes to the approved vendor experience through the supported refresh flow, with one activation notification. Initial approval alone cannot unlock final vendor capabilities.

## WP06 Unify prices and commission overrides

**Implementation**

- Inventory every pricing key and caller; write a canonical, typed policy with explicit percent-versus-multiplier units. Introduce a compatibility migration for `express_surcharge`/`express_multiplier`, tax key variants and platform fee key variants. Report conflicting records for resolution rather than choosing silently.
- Add vendor and vendor-service commission overrides, nullable fallback fields, effective dates and audit metadata. Resolve specificity consistently. Keep location base prices, discounts and commissions as distinct concepts.
- Build a server quote service accepting service IDs, quantities, tier, vendor, location and service mode. Fetch rates and logistics quotes server-side. Treat client prices/multipliers as informational at most.
- Apply the agreed formula, free-delivery threshold, discount eligibility, tax policy and rounding in one engine. Support legitimate zero settings explicitly.
- Issue a versioned quote with expiry; revalidate availability and policy at order creation. Freeze the accepted policy version, source rates and breakdown on the placed order. Do not retroactively reprice placed orders when configuration changes.
- Make admin previews and client carts consume the same quote contract. Keep invoice generation on recorded order facts.

**Acceptance**

Worked examples cover both tiers, vendor/service overrides, no override, normal/Express, below/equal/above threshold, zero commission, decimals and mixed services. Tampered request amounts cannot change the server charge. A config change affects eligible new carts/orders while existing placed orders retain their totals. The admin editor round-trips exactly the policy used by the next quote.

## WP07 Add auditable vendor ranking

**Implementation**

- Define an effective score from objective performance inputs plus an admin adjustment. Separate displayed customer rating from marketplace visibility rank.
- Add boost/penalty editor with reason, effective period, allowed range, actor and before/after score. Include expiry/reversal and clear active overrides.
- Apply ranking after geography, eligibility, tier, availability and service checks so a boosted vendor cannot bypass service radius or blocking.
- Replace the vendor list’s fixed 4.8 rating and fabricated revenue defaults with real aggregates or an explicit unavailable state.

**Acceptance**

Two equally eligible vendors reorder after an approved adjustment; penalties and expiry work; blocked/out-of-zone vendors remain excluded; displayed rating stays the genuine customer rating; every override has audit history.

## WP08 Assign and track support ownership

**Implementation**

- Add `assignedTo`, assignment timestamps/history and optional team/queue fields to Ticket. Validate assignees against eligible active support staff.
- Create assignment/reassignment API with permissions and concurrency protection. Add staff filter, “unassigned” view, workload count and internal ownership history.
- Keep technical issues separate from order disputes while linking shared customer/order context. Ensure supplier/vendor tickets retain their actual role rather than spoofed sender roles.
- Complete the ticket lifecycle: open, assigned/in progress, resolved/closed and a policy for reopening. Keep responses, assignments and resolution reasons auditable.

**Acceptance**

Assignment persists after reload, unauthorized assignment fails, competing assignments have deterministic outcomes, reassignment history is visible and the assignee’s queue updates. Reply and resolve regressions continue to pass.

## WP09 Connect custody evidence and financial resolution

**Implementation**

- Add evidence records for order, leg/phase, uploaded-by identity, capture/upload timestamps, media URL/key and optional item references. Protect access with signed/authorized retrieval and retention rules.
- Populate original pickup photos and return/delivery evidence in the dispute investigation view. Provide a chronological custody timeline and side-by-side comparison; distinguish original evidence from later chat attachments.
- Introduce a refund/adjustment case linked to ticket, order and payment. Support approved full/partial refunds with reason, evidence, remaining refundable amount and actor permissions.
- Use durable operation IDs, transactional ledger updates/outbox, provider idempotency where supported, retries and webhook reconciliation. A timeout must not cause a duplicate refund or a false “completed” status.
- Implement wallet credits as immutable ledger entries with a reference to the case. Enforce policy limits and prevent a duplicate credit across concurrent requests.
- Close the ticket independently from the financial operation state. Make pending/failed settlement visible to support and the user.

**Acceptance**

Original evidence loads for the correct order only. Duplicate requests and provider timeouts produce exactly one financial result. Over-refunds and unauthorized credits are rejected. Ledger/balance/provider results agree. A resolved chat does not mark a failed refund as paid.

## WP10 Reconcile settlements and revenue leakage

**Implementation**

- Add reachable finance navigation and routes. Mount the existing payout foundations only after data contracts and permissions are corrected.
- Model settlement batches with period, eligible order entries, gross/vendor share/commissions/logistics/refunds/COD offsets, net payable and workflow state. Preserve batch inputs and corrections.
- Persist vendor cycle and bank/transfer policy. Distinguish recording an external payment from initiating a provider payout. Validate positive amounts, remaining payable, transaction uniqueness and authorization.
- Add COD receivable/remittance/reconciliation entries. Identify collected-but-unremitted cash, unpaid delivered orders, cancelled-order value, refund exceptions and payout discrepancies with aging and responsible party.
- Replace derived payout approximations with actual ledger/batch/transfer aggregates. Provide detail reconciliation and filtered CSV/PDF exports from the same query contract.

**Acceptance**

A seeded batch reconciles to order-ledger inputs and recorded transfers. Repeated batch runs do not duplicate obligations. Negative/oversized payouts fail. COD collections settle the correct receivables once. Report totals equal the sum of exported lines, and scoped admins see only authorized financial records.

## WP11 Deliver TAT and geospatial reports

**Implementation**

- Add an accessible Reports section with distinct report contracts, not a shared chart with a different heading. Replace decorative accuracy/freshness claims with measured metadata.
- Define vendor processing TAT from intake to ready; report average, median, p90, sample count and breach count. Handle cancellations, missing timestamps and incomplete orders explicitly.
- Build an order-coordinate density aggregate with time, tier, channel, status and geography filters. Support agreed 3 km zone analysis and a map layer with stable legend and sample totals.
- Apply permissions and consistent reporting filters, validate date ranges, paginate detail tables and implement actual exports. Protect privacy in low-count map cells according to the business policy.

**Acceptance**

Known timestamp fixtures yield exact average/median/breach results. Missing timestamps are reported rather than treated as zero duration. Map counts sum to the filtered eligible orders; adjacent zones and out-of-area records behave correctly. Export actions create correct usable files.

## WP12 Verify lifecycle and release readiness

**Implementation**

- Convert the BRD notification tables into an event-recipient-message-action matrix. Cover confirmed, assigned, OTP, intake, ready, outbound, final verification, payment, review, payment failure, overdue processing and role switch.
- Use a durable outbox/retry mechanism and recipient-specific deep links. Standardize current simulated and provider communication paths; make provider mode and delivery failures observable.
- Verify custody phases occur in order, require the correct actor and evidence, reject reuse and enforce one-time OTPs. Ensure the final event drives the intended remaining-payment flow.
- Add end-to-end journeys for vendor approval, user audit, service update and quote, dispatch/handovers, support assignment, evidence-backed refund, COD reconciliation and settlement reporting.
- Reconcile the previously failing frontend location-service tests with their intended fallback behavior in a separate change; preserve the invoice/filter test results.
- Run provider sandbox checks only with the intended credentials and test accounts. Record provider receipts/callback evidence separately from mocked local tests.

**Acceptance and release gate**

No known P0 data-integrity or access-control issue remains. UI, API and persisted results agree for all counted requirements. Unit, integration, browser, permission and financial-concurrency tests pass. No invoice or order detail page uses invented fallback transaction values. The business signs off the formula, advance-payment policy, invoice reference and settlement rules. Every external integration is either verified in the intended mode or explicitly excluded from release.

## Suggested phase sequence

| Phase | Work | Exit condition |
| --- | --- | --- |
| 0 Baseline and decisions | Freeze traceability, fixtures, pricing examples, scope and invoice reference | Agreed policies and reproducible acceptance datasets; no production mutations required |
| 1 Correctness foundations | WP01, WP02 and WP06 | Real order details, enforced permissions and authoritative frozen prices |
| 2 Operating workflows | WP03, WP04, WP05 and WP08 | Correct fresh dashboard, exception queues, user audit and accountable support |
| 3 Financial resolution | WP09 and WP10 | Evidence-backed cases, reconciled refunds/credits, COD and vendor payables |
| 4 Growth reports | WP07 and WP11 | Real ranking adjustments, TAT and density reports |
| 5 Acceptance | WP12 plus WP00 regression | Each open requirement satisfies its acceptance criteria and provider-dependent evidence is recorded |

Testing and policy work start in phase 0 and continue throughout. Providers, refund cases and finance contracts should be designed early even when their UI is delivered later. Dependencies are explicit so phases can overlap where safe without claiming linear estimates are guaranteed calendar time.

## Coverage check

- WP03/WP04 close all nine dashboard requirements.
- WP01/WP02/WP05 close the six open user/role requirements; the five supported items receive regression acceptance.
- WP06/WP07 close ten open marketplace requirements; service CRUD and config persistence receive regression acceptance.
- WP08/WP09 close five open support/dispute requirements; queue, messaging, resolution and chat logs receive regression acceptance and authorization hardening.
- WP10/WP11 close four open strategic-report requirements; inquiry repositories receive regression acceptance.
- All **34 open requirements** have a named package. Architecture deviations and provider acceptance are visible, separately scoped dependencies rather than hidden “completed” items.

## Delivery record for the invoice request

Already implemented: expanded basic details editor, compatible defaults, API validation and error handling, persisted settings, both React previews, customer-history print text, and shared admin PDF header/footer details. Remaining: supplied-reference fidelity; full document consolidation, immutable issued invoice records, corrected sample order detail and financial-data reconciliation in WP02/WP06. Existing tax/settlement behavior was not silently redefined as part of editing basic invoice details.
