# Operational dashboard delivery — 24 October 2026

This supersedes the dashboard findings in the earlier [verification baseline](DASHBOARD_VERIFICATION.md). It describes the local implementation, not a production rollout or live provider certification.

## Current scope

The dashboard now contains the BRD's active-order total, recorded riders on active trips, today's GMV, delayed pickups and unpaid deliveries beyond two hours. The inherited Partners & Clients, Order Lifecycles, Financial Intel and Catalogs & Support tabs and their cohort/churn, payout/profit, ranking and auxiliary charts are removed from the dashboard. Management screens used by other BRD workflows remain available.

The user explicitly excluded standalone Health & SLA, Reports & Reconciliation and Vendor Ranking. Their previously removed pages, navigation, APIs and background monitor remain withdrawn. The original BRD's server/WhatsApp/payment health monitoring is therefore excluded from this delivery. The role-invitation searchable geofence multi-select remains in place.

## Metric contract

| Display | Source and behavior |
| --- | --- |
| Active orders | Current B2C processing/fulfilment statuses plus current submitted/confirmed/accepted/processing/dispatched B2B orders. Excludes delivered, settled, cancelled, rejected, carts and payment drafts. Not restricted by booking date. |
| Recorded riders on trips | Distinct normalized stored rider phones, with assigned rider account IDs as a fallback, on active B2C trip statuses. Shows unidentified trips separately. Does not infer riders from order counts or online accounts. B2B rider identities are unavailable. This is stored assignment evidence, not live GPS/provider availability. |
| GMV today | India midnight through measurement time. Booked B2C value excluding cancellations plus submitted/confirmed/accepted/processing/dispatched/delivered/settled B2B value. Legacy mixed-case statuses are normalized. Integer paise accumulation preserves currency precision. This is not cash collected. |
| Selected-period GMV | Same eligibility, geography, channel and permission rules, with the selected booking window. Daily GMV remains visible independently. |
| Delayed pickups | Open, non-walk-in B2C pickup orders, at least two hours from expected pickup, trigger time or booking time. Old unresolved orders remain visible. |
| Unpaid deliveries | Delivered B2C orders with pending payment, positive due amount and a recorded delivery event at least two hours old. Missing event times are counted explicitly, not invented. B2B has no equivalent timestamp/balance contract and is not represented as verified in these queues. |

Cards and queues are calculated from the same permission-scoped records. Queue totals precede pagination; each queue returns up to 20 items, ordered by deadline and order ID, with real admin order links. Completed payments and pickup transitions clear applicable alerts on refresh. The endpoint is read-only.

## Synchronization and geography

- Requests use `view=operational` on the existing authenticated dashboard endpoint. The prior analytics response remains available for compatibility; the dashboard no longer requests or renders its auxiliary metrics.
- Filters apply on every request. Automatic refresh uses the current filters, refreshes location choices and resumes when the tab becomes visible. Refresh is polling every 60 seconds, not push delivery.
- Changing filters aborts the previous request, and a request generation guard ignores late responses. Filter changes hide the previous selection's metrics. Failures clear metrics and retain the filter form and retry controls. Requests time out after 20 seconds.
- Canonical geofence names round-trip without title-case conversion. Unknown service-area states are no longer invented. Cities without a known state remain selectable. Supplier geography uses supplier details.
- Selected B2C geofences use stored pickup coordinates, or the vendor location for walk-ins. B2B uses stored postcodes intersected with geographic permissions. State/city/pincode filters for B2C use current account addresses; archived or unlocated accounts may be excluded when those filters are selected. This limitation is displayed, because historical orders do not store structured address geography.
- Existing assigned-area permission rules remain fail-closed. Every refresh reads current stored permissions. No new payment policy, collection flow or settlement formula is introduced.

Delivery callbacks now append status-transition timestamps atomically with their status update. Repeated callbacks, including concurrent duplicates, retain the original delivery event instead of extending the unpaid-delivery deadline. Earlier missing timestamps are not backfilled from unrelated edits.

## Acceptance evidence

Final validation:

- Backend unit tests: **117 passed**.
- Full backend API/socket tests: **912 passed**, zero failures.
- Frontend tests: **96 passed** across 18 files.
- Admin desktop browser journeys: **12 passed**, including invoice downloads, permission-error retry, removed-section redirects, searchable role geofences and polling with current filters.
- Targeted delivery/dashboard API rerun: **16 passed**, including concurrent repeated delivery callbacks preserving the original event.
- Production frontend build passed; dashboard component/test lint and `git diff --check` passed. The build retains existing bundle-size/dynamic-import warnings.

After the full run, a final archived-vendor guard was added to geofence selection and verified by all four tests in the targeted operational dashboard suite. Relevant cases live in `backend/tests/api/dashboardOperational.test.js`, `backend/tests/unit/dashboardMetrics.test.js`, `backend/tests/api/logistics.test.js`, `frontend/src/modules/admin/pages/DashboardPermissions.test.jsx` and `frontend/e2e/admin.order-detail.spec.js`.

Test data uses disposable local databases and disabled or mocked providers. Original audit JSON files remain historical evidence of the earlier defects; they are not rewritten as passing results.

## Remaining practical limits

Live fleet presence and provider connectivity/latency have not been verified. Legacy missing delivery times cannot prove a two-hour breach. B2B lacks delivery-event and rider identity fields. Historical geographic filtering is constrained by the saved data described above. Large-production-dataset load acceptance and deployment are separate from local correctness checks. These limits must not be described as full compliance with the unmodified original BRD.

## Hosted screenshot follow-up

The user's follow-up screenshots show `https://ezoflife-six.vercel.app/admin/dashboard`. A read-only check of the public HTML and its served application script confirmed `/assets/index-ClKS3pUI.js` still contains `Catalogs & Support`, `Order Lifecycles`, `Partners & Clients`, `Financial Intel` and `Churn Risk`, and does not contain the current local `Operational Dashboard` title. The hosted build therefore differs from the local replacement. This is direct public bundle evidence; authenticated production records and API responses were not inspected. No deployment was performed.

The original BRD was checked again, including its tables:

| Screenshot section | What the BRD actually requires | Assessment |
| --- | --- | --- |
| Overview | Section 5.1: active orders, riders on trips, daily GMV, health monitors, and pickup/unpaid-delivery alerts beyond two hours | A dashboard is required. This particular funnel and the additional financial/support widgets are not specified as its required layout. Health monitoring remains excluded by the user's later instruction. |
| Order Lifecycles | Booking, processing, dispatch, handovers, delivery and payment workflows elsewhere in the BRD | The operational flow is required. A separate dashboard lifecycle analytics tab is not specified. |
| Catalogs & Support | Section 5.3 service add/edit/deactivate; section 5.4 help desk, assignment, replies, resolution, disputes and evidence | The management functions are required. A combined dashboard chart tab is not specified. Supplier-product analytics are expanded application scope, not an explicit original admin dashboard requirement. |
| Partners & Clients | Section 5.2 user/role control, vendor approvals, user history and blocking | Management is required. Churn, onboarding-friction, business-type charts and top/bottom rating panels are not specified dashboard requirements. |
| Financial Intel | Section 5.5's table specifies settlements, vendor TAT, density, revenue leakage and B2B inquiry repositories | Financial/reporting requirements exist, but this specific dashboard tab is not mandated. The user's subsequent reporting/ranking exclusions remain controlling. |
| Labor Exchange Pipeline | No corresponding admin dashboard requirement in the original BRD | Extra analytics. The local legacy endpoint counts `JobApplication` records by creator role; the screenshot caption describes job requisitions, which is a different population. |

The screenshot's blank/zero panels cannot establish that the underlying workflow is broken. Current processing/dispatch counts can legitimately be zero when orders are already completed. Rating lists can be empty when there is no matching feedback in the selected permission/geography/date window, and the screenshot lacks an explicit no-data message. The local legacy endpoint also contains real definition problems: B2B catalog totals count all products rather than active-only products; its order "funnel" mixes historical acceptance with current statuses; and delivery-time performance cannot be inferred from a scheduled date alone. These legacy widgets are no longer mounted in the local dashboard.

The remaining rollout step is a coordinated frontend/backend deployment of the tested local replacement. Deploying only the frontend could leave its `view=operational` requests against a backend that still returns the legacy contract. Production empty-state/data correctness has not been certified from screenshots or public JavaScript.


## Labour scope clarification

The user clarified that Hire Talent is required and only labour management/pipeline analytics should be removed from the admin dashboard. The dashboard has no labour panel, and the legacy analytics contract no longer queries job applications or returns `atsLaborExchange` or `talentRequisitionIndex`. Dashboard permission scoping no longer loads job applications for these removed metrics. Vendor/supplier Hire Talent, requisition creation/history, specialist assignment, Careers and their APIs remain available. No hiring data was deleted. Earlier discussion of removing the entire hiring feature is superseded by this clarification.

### Hosted card still present after the local removal

A second public-bundle check confirmed the hosted app still serves `/assets/index-ClKS3pUI.js` with the `Labor Exchange Pipeline` card and without the local `Operational Dashboard` replacement. No Vercel deployment connection or CLI/project linkage is available in this workspace. The live site was not changed.

For a deployment that retains the older five-tab dashboard, [remove-legacy-dashboard-labor-card.patch](patches/remove-legacy-dashboard-labor-card.patch) is a frontend-only alternative prepared against the current committed dashboard source. It removes the complete ATS card and changes its catalog layout to two columns, with matching full-width spans. The patch was checked and applied successfully to a disposable copy of that committed source. The actual deployment branch must be checked for compatibility before applying; it may differ from this baseline. Do not apply this legacy patch over the already-replaced local dashboard. All Hire Talent workflows and APIs remain intact.

The source change must reach Vercel's configured deployment branch/build to affect the hosted site. Redeploying the same unchanged remote commit will keep the card present.

## Visual presentation correction

The user requested a simpler, more visual dashboard after reviewing the sparse operational replacement. The dashboard now has a neutral background, explicit compact corner radii independent of the global theme, aligned filters, four concise metric cards, a GMV trend area chart and a grouped active-workload bar chart. Long metric/geography explanations move into an expandable “About these numbers” note. Overdue queues remain linked to real orders. No labour pipeline, vendor ranking or health/reporting module is restored; Hire Talent is unchanged.

The GMV chart uses the selected period and the same eligible, permission-scoped booked-order values as the GMV total. Its India-time buckets are hourly for windows up to one day, daily up to 90 days, monthly up to three years, and yearly for larger custom windows. Empty buckets contain actual zero totals; no sample transactions are introduced. The default chart window is the last seven days, while the GMV-today card remains India midnight to measurement time. Active-workload bars group current B2C/B2B statuses and reconcile to the active-order card, independently of booking dates. Missing chart fields show an explicit unavailable state for compatibility with an older backend.

Validation for the visual correction: seven dashboard metric unit tests, four operational API checks, six frontend dashboard tests and three targeted browser journeys passed; the final desktop/mobile preview journey also passed after waiting for the existing sidebar resize animation. The new chart totals reconcile with their cards, and no mobile page overflow was detected. Desktop and mobile screenshots were inspected. Production frontend build and focused lint passed. These are local checks; no production deployment was performed.

## Restored business overview

The user requested combined transaction values, partner/client breakdowns, an order timeline and a financial overview. These are restored as concise dashboard sections without restoring the excluded Reports & Reconciliation module or labour pipeline.

- Combined transaction value uses the same selected-period eligible orders as the Gross Merchandise Value total and chart. Customer orders and vendor supply orders have separate values and counts.
- Partners and clients count current geographically eligible Customer, Vendor and Supplier accounts. Client types use saved individual/business classification; vendor types use `businessType`; supplier types use `supplierDetails.entityType`. Unknown types are “Unspecified,” not guessed from names. Account totals are independent of registration/booking dates. The channel selector limits supplier accounts out of the customer channel and customer accounts out of the supply channel.
- The financial overview shows paid order value, recorded customer balances, pending supply-order value, recorded platform fees and the count/value of orders marked refunded. These are current stored facts for orders booked in the selected period. They do not establish cash collection, completed refund transfers, vendor settlement or accounting profit. The payment flow and fees are not recalculated or mutated.
- The timeline shows up to 12 recent recorded events within the selected period, ordered by event time. History queries include events on orders booked before the period. Customer events link to real admin order detail. Supply orders show creation only, because their model has no status-event timestamps. Customer booking events are deduplicated against the initial placement history.

All new figures use the same current-account permission and geographic scope as the existing dashboard. No names, contacts, payment credentials or order evidence are added to the overview contract. Full financial ledgers/provider reconciliation remain outside this brief overview.

Validation for the restored business overview: ten dashboard reducer/unit checks, fifteen scoped dashboard/report API checks and six frontend dashboard tests passed. Browser permission-error and removed-section checks passed; the complete restored-panel desktop/mobile journey passed after correcting the shared timeline order fixture. Financial, partner and timeline panel screenshots were inspected. The production frontend build, focused lint and diff whitespace checks passed. No production deployment or payment mutation was performed.

## Dedicated supplier analytics

The dashboard now includes a Supplier overview alongside the existing vendor/client breakdowns. It shows current supplier account and approved/unblocked account counts, current active supply orders, selected-period booked supply-order counts/value, saved supplier entity types, completed/cancelled counts and an alphabetical order summary for up to eight visible supplier accounts. A link opens Supplier Management. No supplier ratings, on-time delivery claims or payout estimates are invented.

Account types/names use permission-scoped current supplier records. Order figures use permitted supply-order geography and the existing booking window. Open supply orders include all booking dates. Booked order value excludes carts, payment drafts, cancellations and rejections and reconciles with the financial overview's supply value. Orders belonging to deleted, archived or out-of-scope supplier accounts remain an anonymous aggregate row when the order itself is visible; private supplier names/types are not exposed. The summary clearly notes its eight-account display limit.

With the customer-only channel selected, supplier analytics show an explicit explanation and a “Show supplier analytics” button that changes the channel to All while retaining location/date filters. This avoids silently displaying zero supplier activity because of channel selection.

Validation: eleven dashboard metric/overview unit tests, four scoped operational API checks, six dashboard frontend tests and two desktop/mobile browser journeys passed. Supplier values reconcile to supply transaction totals; customer-only behavior and outside-area supplier privacy are covered. The supplier panel screenshot was visually inspected. Production build, focused lint and whitespace checks passed. No production deployment, supplier-record edit or payment-flow change was performed.
