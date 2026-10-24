# Admin panel BRD audit

Audit date: 23 October 2026  
Baseline commit: `faf107f`, including the current workspace filter changes and the invoice settings changes described below.  
Requirement source: [Business Requirement Document](../../Business%20Requirement%20Document%20%282%29.docx).

**Implementation update:** the figures and findings below are the original audit baseline. The first implementation batch has since replaced sample admin order details and added user search. See [IMPLEMENTATION_PROGRESS.md](IMPLEMENTATION_PROGRESS.md) for current delivery status and remaining scope.

The admin panel contains substantial working CRUD, onboarding, support messaging and lead management. It does **not yet meet the complete admin BRD**. Of 47 individually assessed requirements, **13 have supporting implementations, 19 are partial and 15 are missing**. Therefore, **34 requirements still need implementation or correction**. Several gaps affect operational and financial correctness, rather than only the presence of menu entries.

The immediate priorities are to replace sample order details, make prices authoritative on the server, enforce account and support permissions consistently, and expose reconciled settlement and exception workflows. Adding more dashboard cards before those foundations would preserve misleading totals and incomplete controls.

## Scope and interpretation

The counted scope is the BRD section headed **5 Web Admin Portal**, including its five reporting rows, plus the pricing governance requirements explicitly assigned to Admin in **3 Pricing and Logistics Handshake**. The section numbers repeat elsewhere in the document, so requirements are identified by heading and content rather than section number alone. `P0157` and similar references mean the one-based paragraph index among direct body paragraphs in the DOCX XML, counting blank paragraphs; they are not rendered page numbers. Table 2 is the table listing the five strategic report types.

Requirements were split into independent acceptance statements so that, for example, displaying a ticket queue does not also count staff assignment as complete. The 47 rows are the full denominator for this audit, not the entire mobile application BRD. The dashboard UI beyond those requirements, suppliers, careers, promotions and other additions are inventoried separately and do not inflate BRD completion.

“Implemented” means the relevant UI and persistent backend behavior were found in the inspected source. It is **not** a claim that the production environment, provider accounts, security, scale, fiscal treatment or all user journeys have passed acceptance. “Partial” means a related path exists but a material part is missing, inconsistent, unreachable or not sufficiently established. “Missing” means no usable implementation of that acceptance statement was found in the inspected routes, pages, controllers, models and jobs. Negative findings are bounded to this repository inspection.

This review traced admin navigation to pages, API clients, route guards, controller queries, schemas and relevant mobile order/pricing/notification paths. It inspected the BRD text and tables directly. No production data, payments, messages or cloud account changes were made. Live WhatsApp, Shiprocket, payment credentials and AWS infrastructure were not exercised. Local browser verification uses mocked API responses; endpoint unit tests mock the database.

The existing `GUIDE.md` is secondary documentation. It describes a prior frontend milestone and includes stale or inconsistent claims about backend readiness and provider mocks. It is not used as evidence that a BRD requirement works.

## Results

| Area | Requirements | Implemented | Partial | Missing |
| --- | ---: | ---: | ---: | ---: |
| Authorized web access | 1 | 1 | 0 | 0 |
| Operational dashboard | 9 | 0 | 4 | 5 |
| Users and roles | 11 | 5 | 3 | 3 |
| Marketplace control | 12 | 2 | 6 | 4 |
| Support and disputes | 9 | 4 | 3 | 2 |
| Strategic reporting | 5 | 1 | 3 | 1 |
| **Total** | **47** | **13** | **19** | **15** |

The detailed matrix below is authoritative. Its counts are generated from [requirements.json](requirements.json); any summary row should agree with that dataset. Requirement coverage is 27.7% implemented, 40.4% partial and 31.9% missing. These percentages **must not be interpreted as percentages of development effort or money remaining**. A correct commission hierarchy or refund ledger takes substantially more work than adding a field.

## Findings requiring early attention

### Real order details are replaced by sample data

[AdminOrderDetail.jsx](../../frontend/src/modules/admin/pages/AdminOrderDetail.jsx) builds its order with `useMemo` and fixed customer, date, items, totals and timeline. The route parameter changes the displayed identifier without loading that actual order. The invoice preview in this page therefore also represents the sample. The main Orders table does fetch real orders, so the inconsistency appears when moving from list to detail.

Required correction: fetch the authorized real order by ID, handle forbidden/not-found/error states, use persisted items and custody events, and generate documents from that same record. Add a regression using two orders with different customers and totals. Do not accept a page merely because it shows the requested order ID.

### Pricing configuration has competing meanings and sources

[PricingConfig.jsx](../../frontend/src/modules/admin/pages/PricingConfig.jsx) writes `express_surcharge`, `essential_fee`, `heritage_fee`, `gst_percentage` and `platform_fee_multiplier`. [orderController.js](../../backend/src/controllers/orderController.js) reads `express_multiplier`, `platform_multiplier` and `gst_percent`, and also accepts request-supplied prices, delivery charges and multipliers. [masterServiceController.js](../../backend/src/controllers/masterServiceController.js) uses Essential/Heritage fee keys for catalog previews, while fence pricing has additional multiplier rules.

Consequences: saving an admin value does not prove the next order uses it; a catalog quote and final order may use different rules; vendor-specific commission overrides required by the BRD have no clear authoritative implementation. Zero-value settings can also be replaced by defaults where `Number(value) || fallback` is used.

The BRD’s formula applies the surcharge after adding logistics; the current utility applies service multipliers before adding logistics and then GST. This is a measurable product deviation to resolve, not an assumption that either interpretation is financially correct. The plan includes agreed worked examples, a single server quote engine, explicit units and precedence, and versioned snapshots.

### Account blocking and support access do not form complete enforcement

[verifyUser](../../backend/src/middleware/authMiddleware.js) checks the JWT but does not load the current user and reject blocked accounts. [toggleUserStatus](../../backend/src/controllers/adminController.js) changes database status, so already-issued sessions can remain active on paths using that middleware. `verifyAdmin` checks status only when its user lookup finds a record; a deleted/nonexistent admin is not explicitly rejected by that branch. Other role middleware does not apply the same read-only checks consistently.

[ticketRoutes.js](../../backend/src/routes/ticketRoutes.js) leaves several ticket read endpoints without authentication middleware, and ticket mutation controllers accept sender/customer identifiers from the body. [socket.js](../../backend/src/socket.js) accepts arbitrary room joins without a token and room-ownership check. These are source-level access-control findings; this task did not exploit other users’ production records. Prioritize authentication, resource ownership, sender identity, scoped admin permissions and socket room authorization before expanding the support workflow.

### Reporting screens and finance pages are not necessarily reachable

`Payouts.jsx`, `Reports.jsx`, `Analytics.jsx`, `CustomerPayments.jsx` and `B2BLeads.jsx` exist, but are not mounted as those pages in [AdminRoutes.jsx](../../frontend/src/modules/admin/routes/AdminRoutes.jsx). Related dashboard cards or separate inquiry pages do not make their absent report workflows reachable. `Reports.jsx` also reuses generic revenue/category charts for different report names, includes fixed “accuracy” and “freshness” badges, and supplies export action labels without working export handlers. The table header sort icon in `DataGrid.jsx` is not itself a sorting implementation.

Existing payment summaries and [recordVendorPayout](../../backend/src/controllers/adminController.js) provide useful foundations, but recording a transaction reference is different from actually initiating or reconciling a provider transfer. The settlement-cycle control in `Payouts.jsx` changes local component state; it does not establish an automated settlement scheduler.

### Dashboard freshness and filters need a shared data contract

The current dashboard fetches on mount and when filters change. Sidebar counts poll separately. That is different from a real-time operational dashboard. Existing alerts cover bounces, acceptance timeouts, dormant vendors and other conditions; they do not implement the BRD’s two-hour pickup and unpaid-delivery queues.

In [dashboardAnalyticsController.js](../../backend/src/controllers/dashboardAnalyticsController.js), several helper queries overwrite an `extra.createdAt` constraint with the dashboard date range. This can replace intended five-minute, 24-hour or recent-activity windows. Some monthly aggregates run across the full six-month dataset independently of selected channel and geography. User registration date filters can also exclude users whose orders fall inside the operational window. A B2B geofence predicate overwrites a selected pincode predicate rather than intersecting it. Financial `vendorPayouts` is derived by subtracting platform/logistics amounts from revenue; it is not an aggregation of confirmed payout records.

The count badges for support/disputes in [getSidebarCounts](../../backend/src/controllers/adminController.js) try to import nonexistent `HelpDeskTicket.js` and `Dispute.js`, then fall back to zero, despite the real `Ticket` collection. The result can hide outstanding work. Correct these queries before presenting the dashboard as a reliable daily control center.

### Dispute evidence and financial resolution remain incomplete

The dispute center can read chat messages and attachments and close the ticket. Its investigation policy asks the operator to inspect pickup and dispatch photos, but the populated order projection excludes the original `customerPhotos` and no typed custody-evidence viewer is wired. Chat attachments are not a complete substitute for original, timestamped handover evidence.

Cancellation refunds exist, including a provider refund call and wallet restoration. They do not provide delivered-order, partial, evidence-linked dispute refunds or admin credit adjustments. A proper refund workflow needs its own state machine, idempotency, limits, accounting entries, permissions and provider reconciliation. Resolving a ticket must not imply that a refund succeeded.

## Requirement traceability

### Access
1 requirements: 1 implemented, 0 partial, 0 missing.

| ID | BRD reference and requirement | Status | Evidence and remaining work | Delivery package |
| --- | --- | --- | --- | --- |
| AUTH01 | P0153 — Authorized personnel can access a web admin portal | Implemented | AdminGuard and server JWT role checks exist. Separate authorization defects are recorded as release risks rather than ignored. Evidence: [AdminRoutes.jsx:66](../../frontend/src/modules/admin/routes/AdminRoutes.jsx#L66); [server.js:139](../../backend/server.js#L139) | WP01 |

### Dashboard
9 requirements: 0 implemented, 4 partial, 5 missing.

| ID | BRD reference and requirement | Status | Evidence and remaining work | Delivery package |
| --- | --- | --- | --- | --- |
| D01 | P0157 — Total active orders | Partial | Lifecycle counts exist, but totalSubmitted includes finished orders; no single canonical active-order metric shared across screens. Evidence: [dashboardAnalyticsController.js:470](../../backend/src/controllers/dashboardAnalyticsController.js#L470); [Dashboard.jsx:508](../../frontend/src/modules/admin/pages/Dashboard.jsx#L508) | WP03 |
| D02 | P0157 — Riders currently on trips | Missing | Current dashboard has no provider-derived rider-on-trip metric. Legacy stats count online Rider users, which is a different measure. Evidence: [adminController.js:902](../../backend/src/controllers/adminController.js#L902); [Dashboard.jsx:118](../../frontend/src/modules/admin/pages/Dashboard.jsx#L118) | WP03 |
| D03 | P0157 — GMV for the day | Partial | Revenue aggregates and a Today filter exist; the landing default is Last 30 Days. GMV inclusion rules and channel/time filters need reconciliation. Evidence: [Dashboard.jsx:42](../../frontend/src/modules/admin/pages/Dashboard.jsx#L42); [dashboardAnalyticsController.js:381](../../backend/src/controllers/dashboardAnalyticsController.js#L381) | WP03 |
| D04 | P0158 — Server status monitor | Missing | Storage usage and business metrics exist; no server-health status module is wired to the dashboard. Evidence: [Dashboard.jsx:635](../../frontend/src/modules/admin/pages/Dashboard.jsx#L635); [server.js:149](../../backend/server.js#L149) | WP04 |
| D05 | P0158 — WhatsApp API latency monitor | Missing | No sampled WhatsApp availability or latency history appears in the admin dashboard. Evidence: [Dashboard.jsx:118](../../frontend/src/modules/admin/pages/Dashboard.jsx#L118); [index.js:4](../../backend/src/services/whatsapp/index.js#L4) | WP04 |
| D06 | P0158 — Payment gateway latency monitor | Missing | No gateway availability, latency or last-check monitor is wired to admin. Evidence: [Dashboard.jsx:118](../../frontend/src/modules/admin/pages/Dashboard.jsx#L118) | WP04 |
| D07 | P0159 — Delayed pickup alerts after two hours | Partial | Existing bounce, five-minute acceptance and long timeout counts do not implement the required pickup age threshold or an actionable alert queue. Evidence: [dashboardAnalyticsController.js:473](../../backend/src/controllers/dashboardAnalyticsController.js#L473); [Dashboard.jsx:658](../../frontend/src/modules/admin/pages/Dashboard.jsx#L658) | WP04 |
| D08 | P0159 — Unpaid delivered order alerts after two hours | Missing | No dedicated delivery-to-payment aging queue or two-hour alert rule found. Evidence: [Dashboard.jsx:635](../../frontend/src/modules/admin/pages/Dashboard.jsx#L635); [dashboardAnalyticsController.js:722](../../backend/src/controllers/dashboardAnalyticsController.js#L722) | WP04 |
| D09 | P0155 P0157 — Real time operational refresh | Partial | Dashboard fetches on mount and filter changes. Sidebar polling and support sockets exist, but do not continuously refresh dashboard metrics. Evidence: [Dashboard.jsx:161](../../frontend/src/modules/admin/pages/Dashboard.jsx#L161); [Sidebar.jsx:225](../../frontend/src/modules/admin/components/navigation/Sidebar.jsx#L225) | WP03 |

### Users and roles
11 requirements: 5 implemented, 3 partial, 3 missing.

| ID | BRD reference and requirement | Status | Evidence and remaining work | Delivery package |
| --- | --- | --- | --- | --- |
| U01 | P0164 — Pending vendor application queue | Implemented | Pending review queue and backend filtering exist. Evidence: [OnboardingApprovals.jsx:72](../../frontend/src/modules/admin/pages/OnboardingApprovals.jsx#L72); [adminController.js:89](../../backend/src/controllers/adminController.js#L89) | WP00 |
| U02 | P0165 — Review GST and MSME documents | Implemented | Vendor request detail exposes GST documents and MSME certificate links. Physical provider access was not exercised. Evidence: [AdminVendorRequestDetailPage.jsx:312](../../frontend/src/modules/admin/pages/AdminVendorRequestDetailPage.jsx#L312); [AdminVendorRequestDetailPage.jsx:299](../../frontend/src/modules/admin/pages/AdminVendorRequestDetailPage.jsx#L299) | WP00 |
| U03 | P0166 — Approve vendor applications | Implemented | Two-stage approval persists initial review and final activation. Evidence: [adminController.js:189](../../backend/src/controllers/adminController.js#L189); [adminController.js:215](../../backend/src/controllers/adminController.js#L215) | WP00 |
| U04 | P0166 — Reject vendor applications | Implemented | Rejection or revision status and reason are persisted; alert delivery is assessed separately. Evidence: [adminController.js:243](../../backend/src/controllers/adminController.js#L243); [AdminVendorRequestDetailPage.jsx:35](../../frontend/src/modules/admin/pages/AdminVendorRequestDetailPage.jsx#L35) | WP00 |
| U05 | P0166 — Approval switches the customer app to vendor mode | Partial | Final approval changes DB role, but does not publish a role-change event, refresh an existing JWT, or prove active-session routing. Evidence: [adminController.js:221](../../backend/src/controllers/adminController.js#L221); [adminController.js:223](../../backend/src/controllers/adminController.js#L223) | WP05 |
| U06 | P0167 — Search any customer or vendor by phone | Partial | User records contain phone numbers, but Users hides DataGrid search and its searchQuery is not applied to filtering. Approval queues have narrower phone filters. Evidence: [Users.jsx:895](../../frontend/src/modules/admin/pages/Users.jsx#L895); [Users.jsx:326](../../frontend/src/modules/admin/pages/Users.jsx#L326) | WP05 |
| U07 | P0167 — Search any customer or vendor by email | Missing | Email is displayed and editable; no functioning email search is exposed on the central user audit screen. Evidence: [Users.jsx:895](../../frontend/src/modules/admin/pages/Users.jsx#L895); [Users.jsx:378](../../frontend/src/modules/admin/pages/Users.jsx#L378) | WP05 |
| U08 | P0167 — View a user full order history | Missing | User/vendor profile screens do not provide a unified scoped history. The order detail route itself still renders a fixed sample record. Evidence: [AdminOrderDetail.jsx:45](../../frontend/src/modules/admin/pages/AdminOrderDetail.jsx#L45); [Users.jsx:326](../../frontend/src/modules/admin/pages/Users.jsx#L326) | WP02 |
| U09 | P0167 — View saved addresses | Implemented | User management includes location data and an address detail modal. Evidence: [Users.jsx:73](../../frontend/src/modules/admin/pages/Users.jsx#L73); [User.js:46](../../backend/src/models/User.js#L46) | WP00 |
| U10 | P0167 — View a user active tickets | Missing | Ticket data exists in support, but no user-linked active-ticket panel or drill-down is wired to central user auditing. Evidence: [Users.jsx:326](../../frontend/src/modules/admin/pages/Users.jsx#L326); [ticketController.js:43](../../backend/src/controllers/ticketController.js#L43) | WP05 |
| U11 | P0168 — Deactivate users and vendors for violations | Partial | Block/unblock writes rejected/approved status, but generic verifyUser does not check current DB status and existing JWT sessions remain usable. Rejected vendors are omitted from central user listing. Evidence: [adminController.js:832](../../backend/src/controllers/adminController.js#L832); [authMiddleware.js:143](../../backend/src/middleware/authMiddleware.js#L143); [adminController.js:538](../../backend/src/controllers/adminController.js#L538) | WP01 |

### Marketplace control
12 requirements: 2 implemented, 6 partial, 4 missing.

| ID | BRD reference and requirement | Status | Evidence and remaining work | Delivery package |
| --- | --- | --- | --- | --- |
| C01 | P0173 — Add edit and deactivate services | Implemented | Service and master-service CRUD plus activation and approval controls exist. Evidence: [MasterServiceManagement.jsx:243](../../frontend/src/modules/admin/pages/MasterServiceManagement.jsx#L243); [masterServiceController.js:6](../../backend/src/controllers/masterServiceController.js#L6) | WP00 |
| C02 | P0205 — Global Essential default aggregator fee | Partial | essential_fee can be edited and is used in catalog pricing, but order creation also uses platform_multiplier and request-supplied values. Evidence: [PricingConfig.jsx:68](../../frontend/src/modules/admin/pages/PricingConfig.jsx#L68); [masterServiceController.js:170](../../backend/src/controllers/masterServiceController.js#L170); [orderController.js:296](../../backend/src/controllers/orderController.js#L296) | WP06 |
| C03 | P0206 — Global Heritage default aggregator fee | Partial | heritage_fee exists for catalog calculations; the order creation path does not enforce a consistent tier-specific fallback. Evidence: [PricingConfig.jsx:71](../../frontend/src/modules/admin/pages/PricingConfig.jsx#L71); [orderController.js:307](../../backend/src/controllers/orderController.js#L307) | WP06 |
| C04 | P0174 P0210 — Vendor specific commission override | Missing | No vendor commission override field, editor and authoritative resolution path were found. Area price overrides solve a different requirement. Evidence: [AreaServiceOverride.js:14](../../backend/src/models/AreaServiceOverride.js#L14); [User.js:58](../../backend/src/models/User.js#L58) | WP06 |
| C05 | P0210 P0211 — Specific vendor service commission takes precedence | Missing | No vendor-and-service commission override hierarchy found. MasterPricing is service plus fence, rather than vendor plus service commission. Evidence: [MasterPricing.js:92](../../backend/src/models/MasterPricing.js#L92); [orderController.js:307](../../backend/src/controllers/orderController.js#L307) | WP06 |
| C06 | P0207 — New vendors inherit category defaults | Partial | Global catalog fallback exists, but onboarding and order pricing do not demonstrate one resolved Essential/Heritage policy per vendor. Evidence: [masterServiceController.js:170](../../backend/src/controllers/masterServiceController.js#L170); [adminController.js:215](../../backend/src/controllers/adminController.js#L215) | WP06 |
| C07 | P0176 — Update Express surcharge from 1.5x to another multiplier | Partial | Editor saves express_surcharge as a percentage while order creation reads express_multiplier; service/fence multipliers introduce additional paths. Evidence: [PricingConfig.jsx:62](../../frontend/src/modules/admin/pages/PricingConfig.jsx#L62); [orderController.js:295](../../backend/src/controllers/orderController.js#L295) | WP06 |
| C08 | P0177 — Set free delivery threshold | Partial | Global and area threshold fields exist; order creation accepts deliveryCharge from the client and does not enforce one server-resolved threshold. Evidence: [PricingConfig.jsx:74](../../frontend/src/modules/admin/pages/PricingConfig.jsx#L74); [ServiceArea.js:72](../../backend/src/models/ServiceArea.js#L72); [orderController.js:324](../../backend/src/controllers/orderController.js#L324) | WP06 |
| C09 | P0178 — Manually boost vendor visibility | Missing | No persistent ranking adjustment, editor or marketplace ranking integration found. Evidence: [Vendors.jsx:64](../../frontend/src/modules/admin/pages/Vendors.jsx#L64); [User.js:58](../../backend/src/models/User.js#L58) | WP07 |
| C10 | P0178 — Manually penalize vendor visibility | Missing | No auditable rank penalty or effective visibility score calculation found. Evidence: [Vendors.jsx:55](../../frontend/src/modules/admin/pages/Vendors.jsx#L55); [User.js:58](../../backend/src/models/User.js#L58) | WP07 |
| C11 | P0213 — Admin configuration persists | Implemented | SystemConfig upsert persists configuration. Typed pricing governance and change history remain separate requirements. Evidence: [adminController.js:1266](../../backend/src/controllers/adminController.js#L1266); [SystemConfig.js:10](../../backend/src/models/SystemConfig.js#L10) | WP00 |
| C12 | P0214 — Placed orders keep their original price after config changes | Partial | Orders store totals and breakdowns, which supports preservation. Full policy versioning and cross-renderer repricing regression coverage are still needed. Evidence: [Order.js:211](../../backend/src/models/Order.js#L211); [orderController.js:328](../../backend/src/controllers/orderController.js#L328) | WP06 |

### Support and disputes
9 requirements: 4 implemented, 3 partial, 2 missing.

| ID | BRD reference and requirement | Status | Evidence and remaining work | Delivery package |
| --- | --- | --- | --- | --- |
| S01 | P0182 — Technical ticket queue | Implemented | Technical support queue fetches persisted tickets and filters out item-dispute categories. Evidence: [HelpDesk.jsx:39](../../frontend/src/modules/admin/pages/HelpDesk.jsx#L39); [ticketController.js:54](../../backend/src/controllers/ticketController.js#L54) | WP00 |
| S02 | P0183 — Assign tickets to support staff | Missing | Ticket has no assignee fields and no assignment API or staff selector is wired. Evidence: [Ticket.js:30](../../backend/src/models/Ticket.js#L30); [ticketController.js:109](../../backend/src/controllers/ticketController.js#L109) | WP08 |
| S03 | P0183 — Respond to users | Implemented | Persisted support messages and socket events are wired. Authorization hardening is recorded independently. Evidence: [HelpDesk.jsx:84](../../frontend/src/modules/admin/pages/HelpDesk.jsx#L84); [ticketController.js:67](../../backend/src/controllers/ticketController.js#L67) | WP00 |
| S04 | P0183 — Mark a ticket resolved | Implemented | Status update endpoint and resolve action exist. Evidence: [HelpDesk.jsx:108](../../frontend/src/modules/admin/pages/HelpDesk.jsx#L108); [ticketController.js:109](../../backend/src/controllers/ticketController.js#L109) | WP00 |
| S05 | P0185 — Review order linked support chat logs | Implemented | Dispute center loads persisted item-dispute tickets and their messages. Evidence: [DisputeCenter.jsx:209](../../frontend/src/modules/admin/pages/DisputeCenter.jsx#L209); [Ticket.js:44](../../backend/src/models/Ticket.js#L44) | WP00 |
| S06 | P0186 — Review original pickup verification photos | Partial | Chat attachments can render, but the order population omits original customerPhotos and no custody-evidence viewer is wired. Evidence: [ticketController.js:58](../../backend/src/controllers/ticketController.js#L58); [DisputeCenter.jsx:77](../../frontend/src/modules/admin/pages/DisputeCenter.jsx#L77) | WP09 |
| S07 | P0186 — Review return and delivery verification photos | Partial | Investigation policy names dispatch/partner photos, but does not provide a typed, timestamped delivery evidence record and viewer. Evidence: [DisputeCenter.jsx:339](../../frontend/src/modules/admin/pages/DisputeCenter.jsx#L339); [Order.js:218](../../backend/src/models/Order.js#L218) | WP09 |
| S08 | P0187 — Trigger manual dispute refunds | Partial | Cancellation refunds exist in orderController; dispute center cannot start full or partial evidence-linked refunds for delivered orders. Evidence: [orderController.js:1975](../../backend/src/controllers/orderController.js#L1975); [DisputeCenter.jsx:114](../../frontend/src/modules/admin/pages/DisputeCenter.jsx#L114) | WP09 |
| S09 | P0187 — Adjust a user account credit | Missing | Wallet balances and cancellation refunds exist, but no auditable admin dispute credit adjustment operation is provided. Evidence: [User.js:188](../../backend/src/models/User.js#L188); [DisputeCenter.jsx:114](../../frontend/src/modules/admin/pages/DisputeCenter.jsx#L114) | WP09 |

### Strategic reports
5 requirements: 1 implemented, 3 partial, 1 missing.

| ID | BRD reference and requirement | Status | Evidence and remaining work | Delivery package |
| --- | --- | --- | --- | --- |
| R01 | Table 2 Financial Settlement — Automated net vendor payout report after commissions | Partial | Payment summaries and manual payout logging exist, but Payouts is not routed and no dedicated settlement report or automatic cycle is reachable. Evidence: [adminController.js:1464](../../backend/src/controllers/adminController.js#L1464); [Payouts.jsx:64](../../frontend/src/modules/admin/pages/Payouts.jsx#L64); [AdminRoutes.jsx:147](../../frontend/src/modules/admin/routes/AdminRoutes.jsx#L147) | WP10 |
| R02 | Table 2 Vendor TAT Report — Average turnaround time per vendor | Partial | Generic SLA violation counts exist; no vendor-duration aggregation and accessible average TAT report found. Reports.jsx is not routed. Evidence: [dashboardAnalyticsController.js:482](../../backend/src/controllers/dashboardAnalyticsController.js#L482); [Reports.jsx:83](../../frontend/src/modules/admin/pages/Reports.jsx#L83) | WP11 |
| R03 | Table 2 Geospatial Heatmaps — Order density heatmaps for 3 km zones | Missing | Geofence maps and filters exist, but no order-coordinate density layer or time-bounded heatmap report is connected. Evidence: [ServiceAreas.jsx:33](../../frontend/src/modules/admin/pages/ServiceAreas.jsx#L33); [Reports.jsx:83](../../frontend/src/modules/admin/pages/Reports.jsx#L83) | WP11 |
| R04 | Table 2 Revenue Leakage — Cancelled orders and unreconciled cash on delivery | Partial | Cancellation counts and payment summaries exist, but no canonical COD receivable ledger or reconciliation report is wired. Evidence: [dashboardAnalyticsController.js:765](../../backend/src/controllers/dashboardAnalyticsController.js#L765); [Reports.jsx:86](../../frontend/src/modules/admin/pages/Reports.jsx#L86) | WP10 |
| R05 | Table 2 B2B Leads — Partnership and advertising inquiry repository | Implemented | Both intake types persist and have reachable admin listing and stage-management pages; a merged sales pipeline is optional. Evidence: [AdminRoutes.jsx:129](../../frontend/src/modules/admin/routes/AdminRoutes.jsx#L129); [AdminRoutes.jsx:152](../../frontend/src/modules/admin/routes/AdminRoutes.jsx#L152); [partnershipController.js:6](../../backend/src/controllers/partnershipController.js#L6); [mediaController.js:112](../../backend/src/controllers/mediaController.js#L112) | WP00 |


## Supporting application dependencies outside the 47 count

These dependencies affect whether admin behavior meets the broader BRD. They are reported separately to avoid presenting an admin-only sample as an audit of every customer/vendor screen.

| Dependency | Assessment | Evidence and implication |
| --- | --- | --- |
| AWS serverless deployment | Architectural deviation | BRD P0003 specifies AWS serverless. The inspected server is a long-running Express/Socket.IO application with in-process cron jobs. Deployed infrastructure was not inspected. |
| AWS RDS pricing and identity persistence | Architectural deviation | Mongoose models and MongoDB queries replace the BRD’s RDS vendor rate cards and global settings. Migration or formal acceptance of this deviation is needed. |
| S3 documents and evidence | Architectural deviation | Upload middleware uses Cloudinary; some files use local uploads. This does not satisfy an exact S3 storage specification. |
| Server-authoritative logistics quote | Partial | A Shiprocket provider and dispatch layer exist, but order creation still accepts a client delivery charge. An operational provider adapter is not proof of an authoritative quote-to-order pipeline. |
| Live Shiprocket behavior | Not verified live | Provider selection is opt-in and falls back to a mock when disabled or unconfigured. Webhook and dispatch code exist; live account, coverage, callbacks and reconciliation need sandbox/production acceptance. |
| Four custody handshakes | Partial | OTP phases and status changes exist. The generic handshake controller must also enforce phase order, permitted actor, one-time use, evidence requirements and payment trigger behavior. These are WP01/WP12 acceptance items, not assumed complete from OTP fields. |
| Payment after delivery and pickup advance | Partial or divergent defaults | BRD P0055 specifies a 5% pickup advance and remaining payment after delivery. Current `advance_percentage` defaults to 100 and order/payment paths need an agreed policy. Do not silently change it during invoice editing. |
| 24-hour overdue vendor warning | Missing scheduled workflow | Timeout aggregates and pickup/B2B jobs exist, but no verified admin alert delivery workflow for processing past the BRD’s 24-hour threshold was found. |
| Payment-failure reminder | Missing dedicated workflow | A generic notifications interface is not the BRD P0260 automated unpaid-after-delivery rule. |
| Vendor role-switch notification | Missing in approval path | Final approval persists role without dispatching the P0262 message or a role-change event. |
| Complete notification event matrix | Partial | Socket/notification infrastructure exists, but the BRD tables require recipient-specific events, messages and action links at every stage. Some communication helpers still simulate WhatsApp/SMS even though a separate WhatsApp provider exists. |
| Official invoice PDF | Partial | BRD P0079 requires invoice download. Multiple independent HTML/React/jsPDF renderers use different data and financial rules. The editor improvement below does not resolve every tax, identifier, historical snapshot or accounting issue. |

The architecture differences should be decided explicitly. If MongoDB, Express and Cloudinary are approved replacements, update the BRD and assess functional equivalence. If literal AWS serverless/RDS/S3 compliance is required, plan it as a separate migration programme, with data conversion, storage migration, job/event redesign and a rollback plan. The implementation estimate in the companion plan excludes that migration.

## Existing sections beyond the core BRD

| Section or capability | Current source support | Qualification |
| --- | --- | --- |
| Supplier onboarding and catalog | Supplier applications, approvals, supply categories/products, delivery zones and B2B order models/controllers | Expanded product scope; not used to inflate the 47 core admin requirement count. |
| Geofences and master pricing | Map management, area multipliers, master pricing sync and area/service overrides | Useful foundation, but not vendor commission hierarchy or an order-density heatmap. |
| Promotions | Admin/vendor promotions, approval and geofence promotion screens | Separate functional area requiring its own redemption/security acceptance. |
| Careers and role templates | Posts, applications, moderation and templates | Not part of the five core admin BRD modules. |
| FAQs and legal content | Persisted FAQ/legal documents and admin editors | Uses current database/storage architecture rather than the BRD’s stated S3 source. |
| Advertising and partnerships | Public forms, persistent inquiries, admin stage updates and notification attempts | Provider message/email delivery remains environment-dependent. |
| Sub-admins | Invite, access-type and geofence fields/screens | Requires route-by-route enforcement; hiding menu items or checking an HTTP verb alone does not prove all access boundaries. |
| Multi-option filters | Shared checkbox dropdown and array-capable query handling added in this workspace | This is a usability improvement, not evidence that the underlying data metrics or missing searches are correct. |

## Invoice customization delivered in this task

The editor now exposes 11 basic fields: business name, email, phone, website, GST number, registered address, logo image URL, invoice title, payment instructions, terms and conditions, and footer note. Shared defaults merge older configurations safely. The save API validates types, lengths and email/logo fields, preserves existing values during partial updates, and returns failures rather than allowing a false success notification. Failed initial loading disables saving until retry succeeds.

Both customer and B2B React previews consume the new details. Customer history print HTML receives the editable text with escaping, and admin Orders PDF headers/footers receive the shared business/contact/document details while retaining their existing geometry. B2B terms and footer notes now use the saved settings, and its logo visibility follows the toggle. Standard admin jsPDF exports retain their existing text-based header rather than importing a remote logo.

The invoice change is a separate user request, not an invented BRD admin clause. Order recipients, prices, tax policy and invoice identity remain transaction data; the branding editor does not make them arbitrary global fields. No immutable invoice registry or historical configuration snapshot was added. Existing documents generated again can still pick up current details. That is included in WP02.

**Reference status:** no invoice reference image or document was attached to the request in this conversation. The existing layouts were retained. Exact matching to the intended supplied template remains pending receipt and visual comparison; it has not been claimed as complete.

Other invoice findings needing separate financial/data work include fabricated defaults in the sample order detail, differing SAC/HSN assumptions, tier-based or fixed tax calculations across renderers, fixed “paid via Razorpay” wording in the B2B document, and inconsistent invoice numbers. These should be reconciled against persisted transaction facts and an approved invoice specification rather than changed by guessing tax rules.

## Validation and limitations

The filter work preceding this audit passed its targeted component tests, a local browser check, the production build and all 96 then-existing backend unit tests. The broader frontend run had five failures in unchanged location-service tests. The invoice change adds persistence/validation and editor/preview tests; final execution results are recorded in [VALIDATION.md](VALIDATION.md) alongside the report.

The audit includes source checks of route reachability, controllers, schemas, query conditions and supporting provider/job/socket paths. It does not assert that all 47 acceptance statements were executed against a deployed system. No production access or live monetary transaction was required to identify the listed code gaps. Runtime checks in the implementation plan are the required next step for promoting an item from code-supported to production-accepted.

The detailed implementation sequence, acceptance criteria, estimates and dependencies are in [ADMIN_IMPLEMENTATION_PLAN.md](ADMIN_IMPLEMENTATION_PLAN.md). The structured requirement dataset is [requirements.json](requirements.json).
