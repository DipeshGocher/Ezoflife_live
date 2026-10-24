# Admin dashboard verification against the BRD

Verified 24 October 2026.

> **Historical baseline:** The dashboard has since been rebuilt. See [DASHBOARD_DELIVERY.md](DASHBOARD_DELIVERY.md) for the current implementation, validation and remaining data/provider limits. Findings and JSON evidence below describe the pre-fix dashboard.

**The dashboard is not entirely correct and does not fully satisfy the original BRD.** Its five tabs render and several permission/date checks pass, but the current review reproduced 12 discrepancies in 17 isolated API checks, plus a browser-confirmed automatic-refresh filter defect. Passing the earlier regression suite did not cover these acceptance cases.

This review changes no production dashboard, payment or order behavior. It adds an isolated audit runner and evidence files. Health & SLA, Reports & Reconciliation and Vendor Ranking remain removed under the latest user instruction; this report does not propose restoring their pages or background jobs.

## BRD requirements and current status

Source: `Business Requirement Document (2).docx`, original body paragraphs P0155–P0159, read directly from the document. P0157 calls for total active orders, riders currently on trips and the day's GMV; P0158 calls for server and WhatsApp/payment API monitors; P0159 calls for delayed-pickup/unpaid-delivery notifications beyond two hours. Paragraph IDs follow the existing audit's direct-body indexing, not page numbers.

| ID | Original requirement | Current result | Evidence |
| --- | --- | --- | --- |
| D01 | Total active orders | **Partial / incorrect** | The “Active B2C orders” card reads `totalSubmitted`, which includes delivered/cancelled orders and is restricted to the booking period. No combined active B2C/B2B operational total is shown. Fixture: one processing, one delivered and one cancelled order displays a source total of **3**, not **1**. |
| D02 | Riders currently on trips | **Missing** | No provider-derived active-trip rider metric is returned by this dashboard API or displayed in the dashboard. Order transit counts are not rider counts. |
| D03 | Daily GMV | **Partial** | Today defaults to the India business day; non-cancelled B2C booked value works in the fixture. B2B value still includes CART/PENDING_PAYMENT and legacy Cancelled orders. Monthly totals discard currency decimals. |
| D04 | Server status | **Absent; removed feature area** | No server monitor is displayed on the dashboard. The separately added Health & SLA section was deliberately withdrawn; no restoration is assumed. |
| D05 | WhatsApp latency | **Absent; removed feature area** | No measured availability/latency is displayed. This remains an original-BRD difference, not authorization to restore Health & SLA. |
| D06 | Payment gateway latency | **Absent; removed feature area** | Same scope distinction as D05. Provider health must not be represented as verified from configuration alone. |
| D07 | Pickup delay alerts beyond two hours | **Partial** | The backend calculates `sla.pickup2h`, but the dashboard never consumes that field as an alert/queue. Its “Pickup Window Delay” chart uses failed/rescheduled status instead. Old unresolved pickups disappear when the booking window excludes them. |
| D08 | Unpaid delivery alerts beyond two hours | **Partial** | `sla.unpaidDelivery2h` exists in the response but is not rendered as a dedicated alert/queue. Booking-date filtering can exclude delivered orders whose payment becomes overdue later. |
| D09 | Real-time operational refresh | **Partial / incorrect** | The minute timer exists, but its mount-only closure captures the initial filters. After selecting B2C, invoking its registered callback issued a request for **All**. Updates are polling-based, not event-driven. |

For the original nine dashboard requirements, none can currently be certified as fully accepted: five are partial and four are absent. Three absent monitoring items overlap the deliberately removed Health & SLA area. Excluding those three from current delivery scope leaves five partial items and the missing rider-trip metric. The original 47-row audit remains a historical baseline; these are dashboard-only current findings.

## Reproduced discrepancies

API evidence: [dashboard-audit-observations.json](dashboard-audit-observations.json). These use a disposable local database and fixture-only accounts/orders, not the user's production records.

| Priority | Finding | Intended result in the fixture | Observed result | Cause and main source |
| --- | --- | --- | --- | --- |
| High | Active-order card counts terminal orders | 1 active order | **3** | `Dashboard.jsx:531` reads `totalSubmitted`; `dashboardAnalyticsController.js:425` builds an unqualified order-status query and line 454 counts it. |
| High | Returned geofence option does not round-trip | Matching B2C value **₹200** | **₹0** | Stored `MIXED ZONE` becomes displayed `Mixed Zone` at controller line 795; analytics then resolves area names with an exact predicate near line 30. |
| High | Automatic refresh loses the selected filter | Keep **B2C** | Sends **All** | `Dashboard.jsx:164–171` registers a callback in an empty-dependency effect while `fetchAnalytics` closes over initial filter state. Browser evidence is stored separately below. |
| High | B2B booked GMV includes non-booked/cancelled records | **₹200** from four delivered/settled records | **₹350** | Controller line 270 excludes only uppercase CANCELLED/REJECTED. CART, PENDING_PAYMENT and legacy Cancelled remain eligible. |
| High | Payout display is an estimate, not paid money | **₹0** completed transfers | **₹140** | Controller line 346 subtracts platform/logistics from booked value; it never aggregates Payout records. The existing disclaimer is useful but does not make the chart a transfer/reconciliation result. |
| High | Current overdue pickup disappears under Today | 1 unresolved old pickup | **0** | Controller lines 437–438 derive current exceptions from orders already restricted by the booking window. A 40-day-old unresolved pickup is invisible under Today. |
| Medium | Open-dispute card includes ordinary support | **0** disputes | **1** | `Dashboard.jsx:570` displays `helpdesk.open`; its source query counts Open tickets across all categories. |
| Medium | “Active SKU” includes inactive B2B products | **1** active product | **2** | Controller line 417 counts all supply records; `Dashboard.jsx:1259` labels that total Active SKU. |
| Medium | Supplier type is inferred from its name | **1** explicitly typed wholesaler | **0** | Controller line 268 matches business-name text; remaining suppliers are called manufacturers at line 336. Explicit entity type is not used. |
| Medium | Invented state mapping | Bengaluru must not be assigned to Madhya Pradesh | Bengaluru appears under **Madhya Pradesh** | Controller line 766 defaults every unrecognised city to Madhya Pradesh. A correct user-supplied Karnataka address can then coexist with the wrong mapping. |
| Medium | B2B delivered/settled statuses are inconsistent | **4** delivered/settled records | **2** | Controller line 475 accepts DELIVERED and Settled, but omits persisted Delivered and SETTLED variants. Other lifecycle predicates also use inconsistent variant sets. |
| Medium | Monthly totals lose decimals | **₹200.49** | **₹200** | Controller line 375 rounds monthly Revenue to whole rupees while the headline retains decimals. |
| Medium | “30d inactive” changes into Today inactivity | **0** customers inactive for 30 days | **1** | Controller line 161 intersects 30-day activity with the selected booking period; a customer who ordered yesterday is treated as inactive under Today. |

There are **12 API discrepancies** in the table; the automatic-refresh row is a separate browser discrepancy. They are not thirteen failed API tests. These checks establish concrete defects, not a statistical sample of production data.

## Other gaps found by tracing the code

These findings are from source inspection rather than extra fixture assertions:

- B2B on-time delivery is calculated as delivered count minus currently late, still-open orders (`dashboardAnalyticsController.js:519`). Those are different populations. There is no reliable actual delivery-time comparison in this calculation.
- “Never Ordered B2B” uses the selected booking period (`dashboardAnalyticsController.js:208`), so historical purchasers can appear never to have ordered. The same period interaction affects five-day vendor dormancy and 30-day B2B inactivity.
- Platform fees are labelled profit, while the refund value sums entire orders marked refunded. Neither number proves accounting profit or actual/partial provider refunds. Charges, payment collection and refund rules were not changed during this audit.
- Geography is frequently inferred from the customer's current account rather than the transaction destination. Walk-in orders, moved/deleted accounts and historical destinations need an explicit filter contract. Permission scope and geography selection are separate concerns.
- Some registration-approval counts use only admin scope, while selected geography affects other widgets. Global catalogs and current populations also deliberately use different time bases. These exceptions need visible definitions so a shared filter bar does not imply that every widget has the same cohort.
- The labor widget counts applications in the selected report period but its footer says active job requisitions in the last 60 days (`Dashboard.jsx:1329`). Both the entity and period wording are misleading.
- With no feedback, the aggregate average is zero; zero reviews should be distinguishable from a zero rating. Supplier rating scatter points are omitted when a supported stored rating is absent.

## What verified correctly

The five conforming checks in the isolated API audit were:

1. Non-cancelled B2C booked value summed correctly for whole-rupee fixtures.
2. Monthly B2C booked value agreed with the same whole-rupee headline fixture.
3. Explicit pincode and geofence predicates intersected rather than overwriting each other.
4. An admin assigned to an unknown area received zero order value, preserving fail-closed scope.
5. Invalid calendar dates were rejected with HTTP 400.

Additional existing regression checks rerun for this review: **11 dashboard/report API cases passed** and **3 frontend dashboard cases passed**. They cover selected scope/filter/date contracts, failures/retry and incomplete custom-date entry; they do not invalidate the new findings.

The browser rendered Overview, Partners & Clients, Order Lifecycles, Financial Intel and Catalogs & Support without a JavaScript page error. The same diagnostic then demonstrated loss of the selected B2C channel when the registered refresh callback ran. [Browser observations](dashboard-browser-observations.json) record the exact method: the registered 60-second callback was invoked after the filtered response completed; this is not a claim of a timed 60-second production observation. Initial clock-based diagnostic attempts did not establish a refresh; the final callback diagnostic did.

## Safe correction order

1. Fix current-filter refresh and geofence identifiers/state mapping. Add acceptance tests that select a filter and verify the subsequent polling request uses it.
2. Define separate current-state and booked-period contracts. Use explicit active statuses for the operational card and keep overdue current orders visible regardless of booking date.
3. Normalize the already-supported B2B status variants consistently. Exclude drafts/cancellations from booked GMV; preserve currency precision throughout totals and charts.
4. Correct card labels and source queries for disputes, active products, supplier types and activity windows. Display unavailable ratings/comparisons distinctly from zero.
5. Keep financial estimates clearly identified and use recorded transfers for any metric labelled paid payouts. Do not alter the existing payment flow as part of these reporting corrections.
6. Add the original-BRD rider-trip metric only from reliable assignment/provider facts. Any desired inline health or two-hour alert UI needs to respect the user's removal of the standalone sections; do not automatically restore them.

## Reproduction and limits

Run `node tests/audits/dashboardAudit.js` from `backend`. It starts a disposable MongoDB/Express environment through the existing test harness, disables external messaging/logistics, records expected-versus-actual observations, then stops and removes its temporary environment. The runner intentionally writes **observations**, including `conforms: false`; its successful process exit is not an acceptance pass.

The original BRD text, dashboard, analytics/filter endpoint, date/scope helpers and relevant stored schemas were reviewed. No production totals, external provider latency, financial transfers, mobile devices or high-volume behavior were verified. No production runtime source was changed in this review.
