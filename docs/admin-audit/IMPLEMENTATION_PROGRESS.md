# Admin implementation progress

The first implementation batch addresses the sample order-detail screen and adds basic user auditing navigation. It is a local code change with regression checks, not a claim that all 34 open BRD requirements are complete. The [audit](ADMIN_BRD_AUDIT.md) and its requirement counts remain the original assessment baseline.

## Batch 1 real order inspection and user search

### Delivered

- Added `GET /api/admin/orders/:id` behind the existing admin route guard. The new endpoint additionally requires an existing approved admin account, applies that admin’s assigned geofence restrictions, accepts database IDs or encoded readable order IDs, and omits handover OTP values.
- Preserved the existing customer/vendor order endpoints and their response contracts. No order, payment, price, schema or status is modified by the new inspection endpoint.
- Connected Order IDs in the admin list to the actual detail route. Both active and completed orders can be inspected.
- Replaced the sample customer, shop, address, line items, amount and activity timeline with the fetched record. Activity displays persisted events only. Missing metadata is identified as not recorded; deleted-account snapshots remain visible with account links disabled.
- Added loading, missing-order, forbidden, retry and stale-response handling. Navigating to another order removes the previous order and open invoice immediately; delayed requests cannot replace the current route’s record.
- Connected the invoice preview to the inspected record. Quantity, unit price and line amount are distinct. The recorded-only rendering path uses stored amounts and does not invent discounts, platform fees, tax rates, SAC values, invoice numbers or future events. It is opt-in, preserving the existing settings preview and other renderer consumers.
- Kept Print / Save PDF, copied application CSS into the print window, and handled popup blocking without a crash. A record without an issued invoice number displays “Not issued”; this batch does not allocate or issue invoice numbers.
- Replaced the inert termination control on this previously sample-only screen with recorded payment information. This batch introduces no cancellation/refund operation.
- Added name, email and formatted-phone search to the loaded admin user list. Search combines with checkbox filters and runs before client pagination. The customer link opens that search; an existing vendor account links to its vendor detail page.

### Work package status

| Package | Status after this batch | Still needed |
| --- | --- | --- |
| WP02 real details and invoices | In progress; real record inspection and recorded invoice preview delivered | User-linked full order history, immutable issued invoice registry, atomic numbering, full renderer consolidation, reference fidelity and financial policy reconciliation |
| WP05 user auditing and activation | In progress; basic list search and customer navigation delivered | Server-side search/pagination, complete blocked-user auditing, full user history/tickets and active-session vendor role switching |
| WP01 permissions | New detail endpoint enforces active admin and geofence scope | Existing middleware, ticket read/write ownership, socket rooms, global read-only/scoped enforcement and audit events remain open |
| WP00 regression | Existing order contracts covered in selected checks | Broader acceptance continues with each package |

The original U08 requirement is **full user order history**, so a real single-order detail page does not complete that entire requirement. Phone/email search currently covers records returned by the existing user-list endpoint; it does not make excluded blocked vendors visible. Those limitations are deliberately kept open.

## Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Backend unit suite | 100 passed | Existing invoice/filter/provider/other unit regressions |
| Admin order detail, order authorization and order lifecycle API suites | 42 passed | New endpoint tests run with real local Express and temporary MongoDB; existing creation, retrieval, ownership, list and status-transition tests also pass |
| Targeted frontend component and utility tests | 15 passed | Detail fields, recorded invoice values, 403/404/error/retry behavior, deleted snapshots, stale responses, zero-value legacy orders, route changes, invoice settings and checkbox/search behavior |
| Browser acceptance | 3 passed | Order-list navigation, real detail/preview/print-window content and CSS, user search, missing order and absence of mutation requests |
| Production frontend build | Passed | Existing large-bundle/Lottie/import warnings remain |
| Targeted ESLint | Passed | New detail view/data adapter, shared invoice renderer and filter/search utility |

API tests use isolated local databases and disable live messaging/logistics. Browser tests use test-owned mocked API responses and stub the native print dialog. The print window’s content and applied stylesheet are checked. No production data, provider transactions or deployments were touched.

The earlier five location-service frontend failures remain outside this batch; the full frontend suite is not claimed to pass. The whole BRD acceptance and live provider acceptance remain open.

## Next implementation increment

Continue WP01 with shared account-status and ticket/socket ownership enforcement, using explicit regression tests for existing customer/vendor/support sessions before changing authorization behavior. Continue WP02 with user-linked order history once the same visibility rules are established. Pricing, refunds and payouts remain separate packages with their existing behavior preserved until their dedicated acceptance tests are in place.


## Batch 2 invoice downloads and HTTP support permissions

### Delivered

- Restored **Invoices** as the last Orders table column on both Active and Completed views. Customer and vendor download buttons retain the existing styling, PDF generators and calculations. Both downloads have accessible labels. This restores access to the existing documents; it does not implement immutable issued invoices or reconcile their financial policies.
- Consolidated the three shared HTTP authentication guards around current database accounts. Deleted, explicitly blocked and inactive admin accounts cannot continue through those guards using an existing JWT. Current stored roles govern access; promotion to Admin requires an Admin-role session. Read-only admins cannot mutate through the generic user/mixed-role guards either.
- Added an additive `isBlocked` flag to distinguish explicit administrative blocking from application review rejection. The existing user status toggle sets/clears that flag and retains existing status badges. Pending/revision users retain their existing onboarding/support access; rejected customer applications at review stages retain support access unless explicitly blocked. No bulk account migration was performed.
- Required authentication and ownership for ticket reads, order lookups, creation, edits and messages. Ticket/message identity comes from the authenticated account. Customer, vendor and supplier support conversations stay private to their owner; an assigned vendor cannot retrieve a customer's conversation through the order lookup.
- Applied service-area restrictions to admin ticket lists, details, linked orders and mutations. Unknown locations are excluded for restricted admins. Read-only admins can inspect tickets but cannot reply, edit, delete or change status.
- Preserved authorized support creation/replies/resolution, including pending supplier and revision account access. Invalid status values return 400 without persisting; missing tickets return 404. Persisted socket messages include their actual IDs and creation timestamps.
- Removed the hardcoded sender identity from the admin Help Desk. Support API failures now reject instead of being interpreted as successful responses. A permission-denied 403 no longer clears a valid admin session; expired/invalid 401 handling remains.

### Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Backend unit suite | 100 passed | Existing unit regressions |
| Full API regression suite | 818 passed, zero failures/skips | Real local Express and temporary MongoDB, live messaging/logistics disabled; includes nine new ownership/account/scope tests; an additional block/unblock regression passed in the final 10-test focused support suite and existing order/lifecycle/payment contracts |
| Targeted frontend tests | 17 passed | Existing 15 detail/invoice/filter tests plus permission-error/session and successful support API response tests |
| Browser acceptance | 5 cases passed | Existing three detail/print/search cases plus Active and Completed invoice cases; all four downloaded files have PDF headers |
| Production frontend build | Passed | Existing bundle/import warnings remain |

### Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Full backend API/socket regression | 877 passed, zero failures/skips | Isolated local Express/MongoDB; existing order/payment/profile/support/socket contracts plus nine new report cases |
| Focused report suite | 10 passed | Added geofence rewrite denial; final focused rerun also verifies unrestricted area editing remains permitted |
| Backend unit suite | 107 passed | Adds unrestricted query identity/no scan and fail-closed minimal dataset checks |
| Targeted frontend suite | 37 passed | Dashboard error/retry, permission session preservation, independent legacy report errors and previous admin regressions; final invoice change separately reran all nine order-detail tests successfully |
| Browser acceptance | 8 cases passed across runs | Production preview: seven cases passed initially; invoice print CSS failure corrected and its case passed on targeted rerun. Includes dashboard denial/retry/scope notice and earlier order/invoice/audit/history flows |
| Production frontend build | Passed after final print fix | Existing bundle/import warnings remain |
| New report tests/fixtures and API permission tests ESLint; syntax/diff checks | Passed | No claim that unrelated existing page lint or location-suite issues are resolved |

Initial runs under development-server/concurrent load hit navigation or setup deadlines; acceptance was rerun with a production preview and reduced test concurrency. API tests use temporary local databases with external providers disabled; browser fixtures emit no financial/admin mutations. No deployment, production database change or live transfer was performed.

### Remaining boundaries

WP01 remains **in progress**. Socket connection/room authorization, public routes outside the shared guards, global resource/geofence coverage, GET handlers that perform writes, complete block-history auditing and append-only admin audit events remain open. New-ticket notifications use the existing admin room, and the Dispute Center joins that room on connection/reconnection to preserve its updates. This does not make that room authenticated. No claim of complete account revocation across every application transport is made.

WP02 remains **in progress**. The restored table buttons use the existing separate PDF generators. Immutable invoice issuance, atomic numbering, renderer consolidation, financial-policy reconciliation and exact matching against the absent reference remain open. Full user order history, ticket assignment, dashboard/SLA work, pricing, refunds and settlements remain subsequent packages. Original BRD baseline counts are unchanged.

Next increment: authenticate and authorize socket connections/rooms together with frontend reconnect handling and transport tests, then continue resource scope/audit coverage and user-linked order history. Financial behavior remains unchanged in this batch.


## Batch 3 authenticated real-time updates

### Delivered

- Socket.IO handshakes require a signed session token and a current active account, using the same account rules as HTTP. Anonymous, invalid, expired, deleted and explicitly blocked sessions are rejected. Idle connections close at token expiry.
- Room subscriptions are authorized on the server. Users can join their own notification room; customers can read their own tickets; assigned customers/vendors/riders can track their orders; admins can inspect permitted orders/tickets. Vendor/admin pools require the current corresponding role. Read-only admins retain permitted subscriptions; sockets introduce no resource mutation commands.
- Applied the HTTP support geofence policy to admin order/ticket subscriptions and each new-ticket feed event. A vendor assigned to an order cannot subscribe to the customer's private conversation. Unknown room names and malformed identifiers fail closed.
- Migrated all existing application event publishers to a guarded delivery interface. Each delivery checks the current account and resource permission again. Existing room membership therefore does not preserve access after blocking, deletion, role/scope changes or order reassignment. Order updates delivered through personal notification rooms also check current order access.
- Restricted previously global job/labor notifications to the intended recipient or the existing unrestricted admin role feed. Pool-removal broadcasts reach vendors/riders; unknown global events are not broadcast. Scoped admins do not receive legacy role-wide notices without a provable scope; enriching those notices with resource scope remains future work.
- Serialized each socket's event delivery to preserve publication order during asynchronous access checks. Serialized joins/leaves so a delayed join cannot restore a subscription after navigation away. Added join/leave acknowledgements and removed room debug-file writes.
- Centralized frontend token selection for HTTP and sockets. All existing socket consumers now use authenticated clients; the default backend address matches the HTTP default. The latest portal token is read for each handshake. Clients connect when a mounted room consumer has a session, rejoin mounted rooms after reconnecting, and leave rooms on cleanup.
- Counted shared room subscriptions so page cleanup preserves a layout's subscription. Portal/session changes reconnect the shared client. Fixed vendor dashboard event-listener cleanup, and made customer layout subscriptions respond to the logged-in user's identity after onboarding/login navigation.

### Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Full backend API/transport regression | 835 passed, zero failures/skips | Includes 16 new real Socket.IO tests with local WebSocket/polling transports, temporary MongoDB, real HTTP support reply delivery, room ownership/scope, expiry, reconnect, leave races, event order and access revocation |
| Backend unit suite | 100 passed | Existing invoice/filter/provider regressions |
| Targeted frontend suite | 22 passed | Five new socket/session/subscription tests plus previous 17 tests |
| Browser regression | 5 passed | Existing order detail/print/search and both tabs' customer/vendor PDF downloads |
| Production frontend build | Passed | Existing bundle/import warnings remain |
| New socket/session helpers and tests ESLint | Passed | Existing page-level unused-variable/hook diagnostics remain outside this increment |

All transport tests use isolated local servers/databases; messaging and logistics are disabled. Browser tests use test-owned API fixtures. No production data or live provider transactions were touched. The full frontend suite and live-provider/mobile acceptance are not claimed complete.

### Remaining boundaries and next increment

WP01 remains **in progress**: complete HTTP resource/geofence enforcement, routes outside shared authentication guards, GET handlers that perform writes, blocked-user history and append-only admin audit events remain open. A blocked idle socket is disconnected at its next subscription/delivery check; sensitive event delivery is denied using current account state. Token expiry closes idle connections independently. This is not a session-version migration or forced logout of every browser tab.

The publisher checks local connections in the current single-process Socket.IO deployment. Multi-node delivery adapters and high-volume load acceptance are not implemented in this increment; per-recipient database checks need performance acceptance before scaling. Client delivery remains the existing transient Socket.IO contract, with page HTTP reads used to refresh state; durable event replay is not introduced.

Next increment: resource scope coverage and administrative audit history, followed by user-linked full order history under the same visibility rules. Invoice issuance, financial reconciliation, ticket assignment and the other BRD packages remain open. The original 47-row BRD baseline is unchanged; this batch does not mark the entire permissions requirement complete.


## Batch 4 account scope and admin audit history

### Delivered

- Added **Settings → Audit History** at `/admin/audit-history`, backed by `GET /api/admin/audit-events`. The page shows recorded action paths, actor IDs, timestamps, outcomes, HTTP status, correlation IDs and safe account-state snapshots. Search, checkbox outcome filters, refresh/retry and server pagination are implemented, with late responses prevented from replacing newer filter results.
- Added append-only admin audit events for active authenticated admin mutations passing through the shared HTTP guards, including actions outside the `/admin` route family and read-only denials. Each operation receives a server-generated correlation ID and a durable Requested event before the controller runs. The response produces a separate Succeeded/Denied/Failed event; aborted responses have a separate outcome. These are records of attempts and HTTP outcomes, not a guarantee of transaction atomicity.
- Fail closed before mutations if the audit intent cannot be stored. If completion recording fails after a business operation, preserve its original response and mark audit status pending in a response header; the durable intent remains for reconciliation. This avoids reporting a completed financial action as an unperformed failure. There is no automatic completion-repair worker in this increment.
- Audit persistence deliberately excludes request bodies, query strings, passwords, OTPs, documents, bank details, configuration values and message content. Authorized account actions capture only role, status, block flag, onboarding stage and tier before/after persisted changes. No complete historical profile snapshot is introduced.
- Restricted admins can inspect their own audit events; unrestricted admins can inspect all events. Read-only admins can inspect history. Pagination, date/actor/target/outcome filters and escaped search are validated. There are no audit modification/deletion API endpoints; normal Mongoose updates, deletes, replacements, bulk writes and saves of existing events are rejected. This is application-level append-only enforcement, not protection against privileged direct database administration.
- Replaced fail-open/inconsistent account-list filtering with shared service-area checks. Users, vendors, customers, suppliers and pending approval lists use the same account-location rules; lookup failure no longer returns an unfiltered list. Valid zero coordinates are supported, customer default addresses take precedence, and supplier applications use their warehouse location.
- Added matching scope checks before vendor inspection, approvals/rejections, vendor service moderation, document upload, user blocking/deletion, and supplier approval/rejection/profile actions. Out-of-scope document requests are denied before upload middleware. Unknown target accounts produce client errors, and domain vendor/supplier operations cannot delete or convert admin accounts. Unrestricted admin account status toggles retain their dedicated path.
- Prevented restricted admins from global configuration changes, bulk clear operations, sub-admin invitations, unlocated admin customer registration and the global vendor-payout operation. Those actions require unrestricted scope until a narrower resource policy is implemented. Financial formulas and payout logic were not changed.
- Kept blocked vendors/suppliers discoverable in the existing user list, so the current Blocked filter and unblock controls work. Pending vendor/supplier applications remain in onboarding workflows. Supplier profile updates are limited to the fields used by its existing editor and cannot change roles or admin permissions.
- Removed database writes from public configuration reads and diagnostic GETs. Configuration responses merge virtual defaults with saved values, preserving startup/default behavior without automatic seeding. Diagnostics report invalid roles instead of silently repairing users.
- Admin API wrappers now reject HTTP failures instead of treating denied account actions as saved. Existing successful response shapes and valid admin sessions on permission denial remain intact.

### Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Full backend API/socket regression | 852 passed, zero failures/skips | Includes new account-scope/audit coverage and existing order, support, socket and payment contracts |
| Focused audit/scope API suite after filter integration | 13 passed | Real local Express/MongoDB; zero coordinates, warehouse scope, denied writes preserving storage, block/unblock history, secret omission, read-only GETs, protected admin identities and audit preservation/immutability |
| Backend unit suite | 105 passed | Five new tests cover safe snapshots, intent failure, completion failure, duplicate shared guards and fail-closed scope lookup |
| Targeted frontend suite | 27 passed | Four audit-page tests plus denied account API handling and existing detail/invoice/filter/socket tests |
| Browser acceptance | 6 cases | Existing five order/invoice cases plus sidebar navigation, safe audit details and combined checkbox filters |
| Production frontend build | Passed | Existing bundle/import warnings remain |
| New audit page/tests and permission API tests ESLint | Passed | No claim that unrelated existing page lint issues are resolved |

API/socket tests use temporary local databases with live messaging/logistics disabled. Browser tests use test-owned fixtures. No production database, deployment or live financial transfer was involved.

### Remaining boundaries and next increment

WP01 is still **in progress**. Public profile/document/onboarding routes outside shared guards, global dashboard/payment/report scopes, resource policies in other route families, and any remaining GET-side repairs still require dedicated coverage. This batch does not make every HTTP endpoint private or implement all geofence policies. Scoped audit visibility intentionally uses actor ownership rather than making cross-actor zone-history disclosure assumptions.

Audit coverage starts with this local implementation; no past events are reconstructed. Anonymous/inactive-session access failures and denied GETs are not captured by the mutation hook. Detailed reasons, financial/configuration diffs, retention/archival policy, database privilege separation, external tamper evidence and pending-completion reconciliation remain separate acceptance work. Intent/result events are not atomic with existing business writes; a Requested record without a terminal event is an unresolved attempt and must not be interpreted as success.

Next increment: protect remaining profile/document access paths with ownership and admin scope checks while preserving onboarding, then add user-linked full order/ticket history. Complete aggregate/payment/report scope and remaining audit acceptance subsequently. Invoice issuance, ticket assignment, dashboard/SLA and financial reconciliation packages remain open. Original BRD assessment counts remain the baseline.


## Batch 5 profile ownership and user-linked history — 24 October 2026

### Delivered

- Added authentication and current-account ownership checks to profile reads/edits, document/avatar uploads, applicant submissions, legacy profile completion/status, saved carts and FCM token changes. Unauthorized document requests are rejected before upload middleware. Existing pending/revision accounts retain their authorized onboarding and profile access.
- Admin access to another account uses the existing service-area guard and read-only enforcement. Scoped admins cannot move a profile's governing location outside their zones. Applicant-only routes cannot be used to submit someone else's onboarding, including through an admin session. Admin self-service settings retain their permitted path.
- Generic profile edits use an explicit field allowlist and reject role, wallet, permission, verification, onboarding-state and path/operator injection attempts. Admin account-status edits preserve the existing profile editor behavior while keeping `isBlocked` synchronized; status remains protected from ordinary users. The admin editor sends editable fields rather than a whole stored account with privileged metadata.
- Kept vendor service editing compatible with stored approvals. Owners can maintain existing service activation and pending/offered requests, and enable an already-approved custom service belonging to them. Admin rates and approval states are resolved from existing profile/catalog records; arbitrary approval/rate changes or another vendor's approved service are rejected. Full authoritative pricing/commission policy remains WP06.
- Removed password, OTP/expiry, activation token, FCM token and secret bank-verification amount from profile responses. Profile GETs still compose missing supplier/vendor document and bank display data for authorized viewers, but no longer perform background database repairs during a read.
- Preserved vendor walk-in customer address updates through authenticated phone lookup and a 15-minute signed authorization bound to the vendor, customer and address-update purpose. Only approved vendors may use this delegation; its token is not a login session. Wrong-owner/target, expired, missing and blocked-customer authorizations are rejected. General customer profile reads and unrelated profile edits remain denied.
- The delegated response contains only destination fields. Saving a walk-in destination preserves other saved addresses, accepts only one submitted address at a time and cannot clear the customer's whole address list. The frontend keeps the authorization in component state, refreshes it after OTP registration/lookup, ignores stale lookups and surfaces retryable errors. Existing known-phone walk-in policy is preserved; this token does not establish a new customer-consent or OTP policy.
- Added identity/scope checks to legacy vendor earnings and payout lookups. Their existing calculations are unchanged; historical financial aggregate scope remains separate work.
- Added a history action in the admin user table and `/admin/users/:id/history`. It lists recorded service orders where the account acted as customer/vendor/rider and its own support tickets. It links to actual order inspection and lets admins read a selected recorded support conversation. No sample orders, financial mutations, replies or invoice issuance are introduced by this page.
- Added `GET /api/admin/users/:id/history` with validated section/pagination. Account scope and individual order/ticket scope apply before totals and page slicing. Summaries omit OTPs, private profile/payment fields and message bodies; reading a conversation uses the existing separately authorized ticket detail endpoint. Read-only admins can inspect permitted history. Route/section changes clear prior records and stale responses cannot replace current results.

### Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Full backend API/socket regression | 868 passed, zero failures/skips | Existing account/order/payment/audit/socket contracts plus new profile/history coverage |
| Focused profile/history API suite after final safeguards | 12 cases | Real local Express/MongoDB; cross-account denial, multipart rejection before upload, safe read-only profile composition, protected fields, service approval compatibility, onboarding/cart access, walk-in proof boundaries and scoped history totals/pages |
| Backend unit suite | 105 passed | Existing backend units remain green |
| Targeted frontend suite | 32 passed | Four history-page cases and API payload/delegation compatibility plus prior tests |
| Browser acceptance | 7 passed | Existing invoice/order/audit cases plus user-table history navigation, real order link and recorded support conversation; history browsing emits no mutations |
| Production frontend build | Passed | Existing bundle/import warnings remain |
| New history page/tests and permission tests ESLint | Passed | Existing broader page lint issues remain outside this batch |

API tests use isolated local databases and disable live messaging/logistics. The test harness now redirects SMTP to loopback with empty credentials so API onboarding regressions cannot use workspace SMTP credentials. Browser tests use owned API fixtures. No production data, deployment, external document upload or live financial transfer was used.

### Remaining boundaries and next increment

WP01 remains **in progress**: apply visibility rules to global dashboard/payment/report aggregates and remaining route families, finish admin-management policies and audit acceptance, and review other public onboarding/supplier endpoints. This batch secures the listed auth/profile/upload routes; it does not assert that every application endpoint or stored media URL is private. Existing Cloudinary/document URLs need separate storage/access-control acceptance. Phone changes still follow the existing profile-edit policy; a new phone-verification process is not introduced here.

History covers existing accounts, including blocked users, and service orders in the `Order` collection. It does not add B2B supply history, a deleted-account history browser or historical identity snapshots beyond existing order data. Deleted-party snapshots remain available on stored order inspection. Summary records are loaded per account and filtered before pagination; high-volume query/index optimization and multi-page load acceptance remain open. Full frontend/location-suite and live-provider/mobile acceptance are not claimed complete.

Next increment: finish aggregate/report scope and remaining admin permission policies, then move into canonical operational dashboard metrics and SLA work. Immutable invoice issuance, exact reference matching, financial reconciliation and the other BRD packages remain open. The original 47-row BRD assessment remains the baseline; these increments are tracked separately rather than relabelling all partial requirements as complete.


## Batch 6 dashboard and report permission scope — 24 October 2026

### Delivered

- Apply assigned-service-area visibility before dashboard counts, aggregates, trends, leaderboards, sidebar badges and customer payment summaries. Dashboard filters and order-table customer/zone choices no longer disclose outside-only records. Responses identify their scope, and the dashboard explains shared platform catalogs and excluded unlocated records.
- Reuse account and individual order/ticket policies. Legacy B2B/job records with only a postal code require an unambiguous permitted area; unmapped or overlapping outside-area codes are excluded. Supplier codes with conflicting account ownership are excluded. Shared service/material/supply templates and splash advertisements remain explicit platform-wide catalog counts.
- Keep customer payment arithmetic unchanged while restricting its source records. Outside current customers are not reclassified as deleted customers. Vendor settlement/earnings aggregates have no reliable order/zone allocation, so scoped admin access returns an explicit denial. Owners and unrestricted admins retain existing reads. The legacy, unmounted Payouts component handles independent customer/vendor report failures without losing permitted results; no new financial route is exposed.
- Fix sidebar counts to read actual Ticket records for support/dispute categories and use the persisted catalog activation fields. Protect unrestricted sub-admin exports and omit profile credentials from account responses. Fix query-based vendor identity resolution in the shared account guard.
- Require unrestricted admin scope for service-area creation, edits and deletion: restricted admins cannot redefine the boundaries/pincodes that authorize their own reports. Existing area reads remain available.
- Preserve invoice print styling in production by copying already-loaded stylesheet rules into the print window; unavailable remote font imports no longer hold back local invoice styles.
- Fail closed when report scope cannot be resolved. Build request-local permission snapshots from only the needed datasets and reuse account/order caches. Dashboard errors clear stale metrics and offer retry; permission failures preserve valid login sessions. The test harness cleans up temporary resources if server bootstrap fails.

### Remaining boundaries

WP01 remains **in progress**. Other route families, module-level admin permissions, B2B/escrow operations, storage URL access and the remaining audit acceptance still need review. Report scope loads eligible IDs into memory; high-volume/index/pagination acceptance is not claimed. Current schema limitations deliberately exclude uncertain locations rather than inventing allocation.

Canonical dashboard status/SLA definitions, date/cohort and geography-filter propagation, freshness and financial reconciliation remain WP03/WP04/WP10 work. This batch enforces permission boundaries; it does not certify every existing metric definition or change payment formulas. Invoice issuance/reference fidelity and the remaining BRD packages are still open. Original 47-row assessment counts remain the baseline.


## Combined remaining-package pass — 24 October 2026

The user requested the rest of the batches together, then explicitly retained the **current payment behavior and current flow**. This pass works across WP01–WP12 without changing advance-payment policy, charge arithmetic or initiating live financial/provider operations. It is not acceptance of every remaining BRD item. The detailed [package status and outstanding work](REMAINING_PACKAGE_STATUS.md) supersedes assumptions that a delivered screen closes its entire work package.

### Delivered together

- Dashboard: India business-day Today default, intersected booking/deadline windows, registration-independent account geography, geography/channel/window-consistent monthly totals, same-address location matching, minute refresh/manual retry/time display, stable custom-date entry, and event-based normal processing breaches. Supplier/vendor views no longer invent ratings; financial charts disclose their booked-value basis.
- Health/SLA: reachable server/database readiness and ping latency; explicit unknown provider health/mode; persistent deduplicated exceptions, acknowledgments/reasons, automatic resolution, future scheduled-pickup protection and a restart-safe observation scheduler. No reminders or provider probes with side effects are performed.
- Support/evidence: persisted owner/reassignment history, active staff workload, revision conflict checks and unassigned/owner filters, reopening, real message-party roles, internal history privacy, and authorized submitted photos/custody events in dispute investigation. No original-photo provenance is invented and no financial result is inferred from resolving a conversation.
- Invoice registry: atomic numbers, immutable order/settings facts, unique order/type issuance, concurrent/idempotent creation, explicit customer issuance and frozen preview/printing in order inspection. Other existing download renderers remain an explicit consolidation task.
- Vendor ranking: real feedback remains separate from expiring visibility adjustments, with bounded effective periods, reasons/history, scoped writes, revision conflicts and marketplace application after existing eligibility. Blocked vendors cannot enter the eligible marketplace pool.
- Activation: one persisted in-app activation notice on final approval and authenticated own-profile reconciliation in open customer sessions, with a vendor-mode action using the existing session. No external activation delivery is claimed.
- Permissions: named-role module grants from current account state, matching ticket/order socket checks, B2B ownership/regional pool and escrow scope, notification ownership, and maintenance POST authorization. Legacy unnamed admins retain current access.
- Pricing/finance: save the current pricing inputs/version and resulting breakdown on new orders; add reachable stored-fact reconciliation/TAT/density reports with scoped CSV exports, a projected density visualization, missing-evidence states and pagination. Existing external payout recording rejects invalid/negative amounts and deduplicates a matching transaction reference without changing its financial formula or initiating transfers.
- Regression readiness: fix location fallback orphaned rejections and retain current GPS/IP/OSM/marked-default semantics; cover legitimate zero coordinates. Existing socket/order/payment regressions continue to run on disposable local infrastructure.

### Remaining acceptance

The [package status](REMAINING_PACKAGE_STATUS.md) lists the exact remaining implementation. In particular: quote/commission source authority, all invoice renderers/reference/correction documents, refund/credit/COD/settlement ledgers, remaining route/storage/audit policies, durable external notification delivery, measured provider health/history and provider/mobile acceptance are **not complete**. No high-volume or production rollout acceptance is implied. Original BRD counts remain the baseline.


### Combined-pass validation

| Check | Final result | Scope |
| --- | --- | --- |
| Backend unit suite | **112 passed**, zero failures | Includes India date windows, missing/cancelled TAT evidence, exact distribution metrics, future scheduled pickups, stable SLA events and zero-coordinate density |
| Full backend API/socket suite | **932 passed**, zero failures/skips | Includes 13 new operational/assignment/invoice/rank/activation/evidence/module/maintenance/B2B/payout cases plus current scope and all prior regressions; each suite uses disposable local databases |
| Full frontend suite | **93 passed across 18 files**, zero failures/unhandled rejections | Includes prior location failures reconciled to the current fallback policy, approval mode refresh, custom dates, invoice snapshots, assignment conflicts, reports and existing filter/socket/admin coverage |
| Production browser acceptance | **11 passed** | Existing eight order/PDF/print/audit/history/dashboard cases plus report/density navigation, explicit SLA acknowledgment and invoice issuance; fixture-only API data |
| Density visual QA | Passed | Production-preview screenshot inspected; current-page grid, numeric table, legend and navigation render together |
| Production frontend build | Passed | Existing bundle/import warnings remain |
| New operational/ranking/evidence/assignment/grid components/pages ESLint | Passed with zero errors/warnings | No claim that unrelated existing pages pass whole-repository lint |
| Syntax/diff checks | Passed | New backend controllers/middleware and whitespace consistency |

The first combined API run found an invoice index-readiness race and a historical-date fixture using an immutable timestamp update; the registry now awaits its unique indexes and the test sets historical data explicitly through the fixture collection. A first-sequence counter upsert collision also has a retry path. Subsequent full regression is green. The original frontend fallback tests both asserted an obsolete rejection contract and exposed orphaned rejected promises; current GPS/IP/OSM/marked-default behavior is now tested without unhandled rejections.

No provider credentials were exercised, no live notification was sent, and no payment/refund/payout was initiated. Recording positive test payouts creates only disposable local records. Production deployment and live acceptance remain outside this local pass.


## Requested scope reduction and compact geofence selector — 24 October 2026

- Removed Health & SLA, Reports & Reconciliation and Vendor Ranking navigation and standalone pages. Old UI URLs redirect to the dashboard without signing out. Dashboard SLA drill-down returns to its existing Logistics tab.
- Withdrew the corresponding admin APIs and removed the background monitor. Removed marketplace visibility adjustments while retaining genuine vendor feedback ratings and normal vendor ordering. Existing database records are not deleted.
- Replaced the new-admin geofence checkbox grid with the shared dropdown: case-insensitive search, multiple checked choices, a selected count, bounded scrolling, Escape/outside dismissal and modal-safe portal placement. The trigger keeps the rounded slate form styling.
- Existing invitations still submit geofence names as an array. Clearing every restriction continues to submit `[]` (all-location access). Custom module permissions, role/access selections and invitation submission remain available. The empty selection explicitly says “All locations (no restrictions)”.
- The scope exclusions above supersede earlier BRD/package plans for these standalone features; they are not pending sections to add again.


Validation after scope reduction: **908 API/socket tests**, **112 backend unit tests**, **93 frontend tests**, and **11 production-preview browser cases** passed. The role/geofence and shared-dropdown cases were also rerun after checking custom module-permission compatibility (five focused cases passed). Changed selector/role files pass ESLint; production build and syntax/diff checks pass. Browser fixtures included 80 geofences and verified selection retention, search, clearing, redirects and absent navigation; the modal dropdown screenshot was inspected. Tests used disposable/local data and generated no real invitations, messages or financial operations.


## Dashboard-only verification — 24 October 2026

Reviewed the original BRD P0155–P0159 and all five dashboard tabs/API calculations against the current reduced scope. This was an audit, not a runtime implementation change. The [verification report](DASHBOARD_VERIFICATION.md) documents 12 mismatches in 17 disposable-database API checks plus a browser-confirmed selected-filter refresh defect. Examples include active versus submitted orders, geofence option casing, B2B draft/cancelled GMV, payout estimates, obsolete booking-cohort alerts, disputed/support categories, inactive SKU totals, fabricated state mapping, supplier types, decimal totals and 30-day churn semantics. Five API checks conformed; the five tabs rendered without page errors.

The existing 11 dashboard/report API tests and three frontend dashboard tests were rerun and passed. Their scope did not cover the newly reproduced acceptance defects. Health & SLA, Reports & Reconciliation and Vendor Ranking remain excluded under the user's latest request. No payment rules, production data or dashboard runtime source were changed. Audit observations are stored in the linked report and JSON evidence; they are not labelled fixed.


## Focused dashboard replacement — 24 October 2026

Implemented the user's follow-up request to make the dashboard consistent with the retained BRD scope. Removed auxiliary analytics tabs; added combined active B2C/B2B orders, stored rider identity counts with unknown coverage, exact India-day and selected-period GMV, and paginated two-hour pickup/unpaid-delivery queues linked to real orders. Open work is independent of the booking date filter. Canonical geofence values, unknown-state handling, current-filter polling, cancellation/stale-response guards, visible-tab refresh, timeout/error recovery and location-choice refresh are implemented.

Logistics callbacks now record actual status timestamps atomically with stable event IDs; concurrent duplicate callbacks do not extend delivery deadlines. Current payment behavior, invoice flows and the user's excluded Health & SLA / Reports & Reconciliation / Vendor Ranking sections remain unchanged in scope.

Validation: 117 backend unit tests, 912 full API/socket tests, 96 frontend tests and 12 admin browser journeys passed. Targeted delivery/dashboard API verification also passed (16 tests). Production build and focused dashboard lint passed. The additional focused dashboard suite also passed all four tests after the archived-vendor geofence guard. See [DASHBOARD_DELIVERY.md](DASHBOARD_DELIVERY.md) for exact definitions and limits; the original dashboard verification remains historical evidence. Live GPS/provider health and absent legacy delivery timestamps are not claimed as verified.

## Vendor registration list correction — 24 October 2026

The Registered Vendors filter previously treated only exact `Pvt Ltd` and `Franchise` business types as registered, incorrectly sending Proprietorship and Partnership accounts to the unregistered list. The grouping now includes all registered business entity choices offered by onboarding, normalizes case/punctuation, preserves explicit Unregistered/Local values and uses stored GST details as a fallback for legacy records without a recognized entity type. This grouping does not certify tax registration or change stored vendor data.

Switching registered/unregistered sidebar categories now resets pagination. The business-type editor includes the missing Pvt Ltd/Franchise choices and no longer displays a guessed Proprietorship for a missing value. User-list API failures show an error and retry instead of silently appearing as empty data. Existing API role/status rules and assigned-area permissions are unchanged.

Validation: three filter/search unit tests and two browser journeys passed, covering proprietors, partnerships, legacy GST records, local vendors, multi-page category switching and the existing customer email-search flow. Production frontend build and whitespace checks passed. This is a local source change; no production deployment or database mutation was performed.


## Pre-production verification — 24 October 2026

Completed the available backend unit/API/integration/socket, frontend and production-style browser suites, local load/volume/stress checks, dependency advisories, full-source frontend coverage, syntax and lint checks. Fixed promotion/supply bulk preview errors, media refresh/error reporting, map readiness and test-fixture/navigation/isolation issues. Current release recommendation is **hold**, despite green functional tests: dependency advisories, 437 lint errors, low unit coverage and live/staging/authoritative-pricing acceptance remain open. [PRODUCTION_READINESS.md](../release-verification/PRODUCTION_READINESS.md) contains exact counts, evidence, source fingerprint and reproduction commands. No production data/payment changes, push or deployment were performed.
