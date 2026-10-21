# Business customer section audit — 21 October 2026

Scope: the customer app, including business customers stored as `customerType: retail`. Business customers retain the `Customer` role. Vendor and supplier accounts have separate apps.

## Findings and fixes

- The earlier catalogue and footer fixes remain present: all customer types request the standard catalogue in Home, All Services, and Search, and see “My Orders.”
- Notifications only accepted the `user` persona, while socket events use `customer` and saved notifications use `user`. The page also did not fetch saved notifications and passed its click event to the clear API instead of a customer ID and role. It now loads customer notifications on entry, accepts both persona names, and clears notifications for the signed-in customer.
- Profile setup always started as `individual`, hiding business fields until the customer manually switched back. It now starts with the stored customer type, preserving the business setup form for existing business customers.

## Local verification

The component regression suite exercises four profiles: individual without GST, retail without GST, retail with GST, and individual with GST. These are visibility checks; they do not authorize new onboarding combinations or change GST eligibility rules.

| Section | Verified behavior |
| --- | --- |
| Customer layout | Completed customers reach Home without an onboarding redirect or vendor header; Home, My Orders, Profile, and More remain visible. |
| Home, All Services, Search | Active standard master services and approved vendor services are visible; inactive and pending fixtures are excluded. |
| More | Vendor/supplier registration, advertising, partnerships, wallet, notifications, feedback, careers, referrals, and help links remain visible and navigate correctly. |
| Profile | Customer identity, saved addresses, and customer legal links remain visible. |
| FAQ and Help Center | Shared and customer FAQs are visible; vendor and supplier FAQs are excluded. |
| Wallet | Loads the customer's balance and order transaction history. |
| Orders | Loads the customer's orders without a business-only filter; active and past views are accessible. |
| Notifications | Loads saved customer notifications; marking read and clearing use the correct customer identity. |
| Profile setup | Retail profiles initially see business name and GST fields; individual profiles initially see the individual form. |

The expanded suite has 56 checks. This is a source and local component audit using mocked API responses, not a census or login verification of production accounts. No production customer records were changed. Vendor GST eligibility, invoice rules, and vendor/supplier access were not modified.

## Normal customer follow-up

Normal (individual, no GST) customers pass the same section checks above. Eight additional entry and onboarding checks cover signed-in Home routing, missing and expired sessions returning to sign-in, incomplete profiles going to setup with the footer hidden, individual setup despite a stale `retail` session type, new setup defaulting to individual, login OTP requests preserving customer type, and signup OTP requests defaulting to individual. The combined customer suite now has 64 checks. These checks use mocked APIs; actual OTP delivery and production account data are outside this local verification. No additional application changes were needed for normal customers.
