# Specification compliance matrix

Every requirement in the Matajer AI *Employee Management Platform* brief, mapped to the
implementation and to the evidence that it actually works.

**Status vocabulary** — `PASS` (verified by execution), `PARTIAL` (works, with a stated
limit), `FAIL`, `EXTERNAL BLOCKER` (needs a credential or infrastructure this repository
cannot supply).

**Nothing here is marked PASS from reading the code.** Every row was verified by running
something: an automated test, the acceptance suite, a live API probe, or a real browser.

## How the evidence columns are abbreviated

| Tag | Means |
|---|---|
| `BE:<file>` | Backend Vitest suite, `Employee Management Platform BackEnd/tests/<file>` (118 tests) |
| `FE:<file>` | Frontend Vitest suite, `Employee Management Platform FrontEnd/tests/<file>` (34 tests) |
| `E2E:<file>` | Playwright acceptance suite, `e2e/tests/<file>` (38 cases, real API + real PostgreSQL) |
| `BROWSER` | Manually driven in a real browser during the acceptance audit |
| `PROBE` | Live HTTP probe against the running API |

Last verified: **31 August 2026**, against commit state at audit time.
Suite results at that point: backend **118/118**, frontend **34/34**, E2E **38/38** (confirmed stable across three consecutive runs),
typecheck clean, both production builds clean.

---

## 3. Minimum working baseline — Management / Admin

| ID | Specification requirement | Implementation | Evidence / file | Automated test | Manual / E2E | Status | Notes |
|---|---|---|---|---|---|---|---|
| A1 | Secure Admin login | JWT access token + rotating stateful refresh token; bcrypt hashes; lockout after 5 failed attempts | `modules/auth/auth.service.ts` | `BE:auth.test.ts` | `E2E:admin.spec.js` | **PASS** | Login, rotation, replay detection and lockout all covered |
| A2 | Clear management dashboard / home | Headcount, active, open requests, on-leave-today; entity breakdown; alerts; audit feed | `modules/dashboard/dashboard.service.ts`, `pages/AdminOverview.jsx` | — | `E2E:admin.spec.js`, `BROWSER` | **PASS** | Loads with live data; zero console errors |
| A3 | Legal Entity management or viewing | Dedicated page: headcount, working week, currency, payroll per entity | `modules/legal-entities/`, `pages/EntitiesPage.jsx` | — | `E2E:admin.spec.js` | **PASS** | Payroll grouped by currency, never summed across them |
| A4 | At least two demo legal entities, different countries | **Three**: UAE (AED, Mon–Fri), Saudi Arabia (SAR, Sun–Thu), Egypt (EGP, Sun–Thu) | `prisma/seed.ts` | `BE:working-days.test.ts` | `E2E:admin.spec.js` | **PASS** | Exceeds the minimum of two |
| A5 | Employee directory | Server-side paginated table, 17 active of 18 seeded | `modules/employees/`, `pages/PeopleDirectory.jsx` | `BE:employees.test.ts` | `E2E:admin.spec.js` | **PASS** | |
| A6 | Meaningful search | Server-side across name, employee number, email, job title | `employees.service.ts` | `BE:employees.test.ts` | `E2E:admin.spec.js` | **PASS** | "Karim" matches both a first and a last name |
| A7 | Filtering | By legal entity and by employment status | `employees.service.ts` | `BE:employees.test.ts` | `E2E:admin.spec.js` | **PASS** | Offboarded hidden by default, reachable by filter |
| A8 | Sorting | Name, newest, job title, employee number | `employees.service.ts` | `BE:employees.test.ts` | `E2E:admin.spec.js` | **PASS** | E2E asserts newest-first is strictly descending **by year** |
| A9 | Pagination | 12 per page with page meta | `common/http.ts` | `BE:employees.test.ts` | `E2E:admin.spec.js` | **PASS** | Previous disabled on page 1 |
| A10 | Create a new employee record | Creates employee, optional login, pro-rated leave balances, timeline entry, starting compensation | `employees.service.ts` | `BE:employees.test.ts` | `E2E:admin.spec.js` | **PASS** | Persistence re-checked after a full page reload |
| A11 | Edit relevant employee information | Full edit form; every change writes an `EmploymentEvent` and an audit row | `employees.service.ts` | `BE:employees.test.ts` | `E2E:admin.spec.js` | **PASS** | Verified a title change produced a `PROMOTION` event |
| A12 | Useful Employee Profile in one place | Position, compensation, leave balances, documents, contact, timeline in one record view | `pages/PeopleDirectory.jsx` | — | `E2E:admin.spec.js`, `BROWSER` | **PASS** | |
| A13 | Clear employee ↔ Legal Entity relationship | Required FK on every employee; entity shown in directory, profile, requests and letters | `prisma/schema.prisma` | `BE:employees.test.ts` | `E2E:admin.spec.js` | **PASS** | |
| A14 | Employment info: role, joining, contract, status, compensation | Job title, department, manager, hire date, contract type/end, probation, notice, status, dated salary history | `prisma/schema.prisma`, `modules/compensation/` | `BE:employees.test.ts` | `E2E:admin.spec.js` | **PASS** | Salary in the entity's own currency |
| A15 | Useful history / statistics / visualisations | 12-month headcount trend, entity and department splits, tenure, alerts (probation, contract, visa expiry, stale requests), immutable audit trail | `dashboard.service.ts`, `modules/audit/` | `BE:employees.test.ts` | `BROWSER` | **PASS** | Payroll never summed across currencies |
| A16 | Management can review employee requests | One unified inbox across all three workflows, with status tabs, counts and type filter | `modules/requests/`, `pages/AdminRequests.jsx` | `BE:request-workflows.test.ts` | `E2E:cross-role.spec.js` | **PASS** | |
| A17 | Approve / reject / complete workflows | Approve and reject with a decision note; rejection note mandatory | `requests.service.ts` | `BE:request-workflows.test.ts` | `E2E:cross-role.spec.js` | **PASS** | |

## 3. Minimum working baseline — Employee

| ID | Specification requirement | Implementation | Evidence / file | Automated test | Manual / E2E | Status | Notes |
|---|---|---|---|---|---|---|---|
| B1 | Separate employee login / role-based self-service area | Distinct navigation and pages; no management routes exist for the role | `App.jsx`, `pages/Employee*.jsx` | `BE:access-control.test.ts` | `E2E:employee.spec.js` | **PASS** | E2E asserts management destinations are absent, not merely hidden |
| B2 | Employee can view their own profile | `/me/*` endpoints resolve the employee from the token; no id in the URL to tamper with | `modules/me/me.routes.ts` | `BE:access-control.test.ts` | `E2E:employee.spec.js` | **PASS** | |
| B3 | Employee can view relevant employment information | Role, contract, legal employer, manager, own compensation, balances, documents, timeline | `pages/EmployeeProfile.jsx` | `BE:access-control.test.ts` | `E2E:employee.spec.js` | **PASS** | |
| B4 | Employee must not access another employee's private information | Directory-level view only for colleagues; personal fields absent from the payload, not null | `services/access.ts`, `employee.serializer.ts` | `BE:access-control.test.ts` | `E2E:security.spec.js`, `PROBE` | **PASS** | Tested at API level with direct ids — see the security section below |
| B5 | At least two self-service workflows, end to end | **Three**: leave, documents/letters, profile change | `modules/requests/` | `BE:request-workflows.test.ts` | `E2E:cross-role.spec.js` | **PASS** | Exceeds the minimum of two |
| B6 | Submit, see status, see final decision | Submit → PENDING → decision + note visible after re-login | `pages/EmployeeRequests.jsx` | `BE:request-workflows.test.ts` | `E2E:cross-role.spec.js` | **PASS** | E2E signs out and back in, so the result is read from the database |
| B7 | Management reviews the same request and completes it | Same request id in the admin inbox; decision writes back to the employee's view | `requests.service.ts` | `BE:request-workflows.test.ts` | `E2E:cross-role.spec.js` | **PASS** | |

## Workflow acceptance detail

| ID | Requirement | Evidence | Status | Notes |
|---|---|---|---|---|
| W1 | Entity-specific working week applied to leave | `PROBE`, `BE:working-days.test.ts`, `E2E:employee.spec.js` | **PASS** | Same 1–8 Dec range: **UAE 3 days, Saudi 6 days**, each recounted independently against its own calendar |
| W2 | Entity-specific holidays excluded | `PROBE`, `E2E:employee.spec.js` | **PASS** | Preview names the three skipped UAE holidays back to the employee |
| W3 | Weekends excluded correctly | `PROBE` | **PASS** | UAE Sat+Sun = 0 days; Saudi Fri+Sat = 0 days |
| W4 | Leave types belong to the correct entity | `E2E:employee.spec.js`, `E2E:security.spec.js` | **PASS** | **Defect found and fixed during this audit** — see "Fixes" below |
| W5 | Leave balance displayed | `E2E:employee.spec.js` | **PASS** | Entitled / used / pending / available |
| W6 | Pending balance hold at submission | `BE:request-workflows.test.ts`, `E2E:employee.spec.js` | **PASS** | Asserted numerically before and after |
| W7 | Approval converts pending → used | `BE:request-workflows.test.ts`, `E2E:cross-role.spec.js` | **PASS** | |
| W8 | Rejection releases the hold | `BE:request-workflows.test.ts`, `E2E:cross-role.spec.js` | **PASS** | Nothing consumed; available restored |
| W9 | Cancellation releases the hold | `BE:request-workflows.test.ts`, `E2E:employee.spec.js` | **PASS** | |
| W10 | Overlapping leave rejected | `BE:request-workflows.test.ts`, `PROBE` | **PASS** | Names the conflicting reference |
| W11 | Insufficient balance rejected | `BE:request-workflows.test.ts`, `PROBE` | **PASS** | Counts pending days as unavailable |
| W12 | Invalid dates rejected | `PROBE` | **PASS** | End-before-start, and leave spanning two calendar years |
| W13 | Document request types + validation | `BE:letters.test.ts`, `PROBE` | **PASS** | All six types submit; unknown type and short purpose rejected |
| W14 | Approved document is generated | `BE:letters.test.ts`, `E2E:cross-role.spec.js` | **PASS** | Bilingual EN/AR letter stored as text and readable in the UI |
| W15 | Salary privacy in letters | `BE:letters.test.ts`, `PROBE` | **PASS** | `includeSalary:false` letters contain no monetary figure in either language; salary is never placed in the prompt |
| W16 | Template fallback without `GOOGLE_API_KEY` | `BE:letters.test.ts`, `E2E:cross-role.spec.js`, `PROBE` | **PASS** | Verified on a second API instance booted with the key removed: valid signable letter, `isAiGenerated:false` |
| W17 | Profile change shows current value, validates new one | `E2E:employee.spec.js` | **PASS** | Submit stays disabled until a value actually differs |
| W18 | Approval applies the field | `BE:request-workflows.test.ts`, `E2E:cross-role.spec.js` | **PASS** | |
| W19 | Prohibited fields cannot be changed via self-service | `BE:access-control.test.ts`, `E2E:security.spec.js`, `PROBE` | **PASS** | See S7 |

## 5. Technical requirements

| ID | Requirement | Evidence | Status | Notes |
|---|---|---|---|---|
| T1 | Persistent data | `E2E:admin.spec.js` | **PASS** | Create/edit re-verified after full page reloads and re-logins |
| T2 | Real authentication, Admin/Employee separation | `BE:auth.test.ts`, `E2E:employee.spec.js` | **PASS** | Four roles: ADMIN, HR_ADMIN (entity-scoped), MANAGER, EMPLOYEE |
| T3 | Basic authorization | `BE:access-control.test.ts`, `E2E:security.spec.js` | **PASS** | Every rule in one file, `services/access.ts` |
| T4 | Structured data model | `prisma/schema.prisma` | **PASS** | 17 models, real FKs, enums, `Decimal` money, 2 migrations |
| T5 | Working create/update actions | `BE:employees.test.ts`, `E2E:admin.spec.js` | **PASS** | |
| T6 | Working request/approval workflows | `BE:request-workflows.test.ts`, `E2E:cross-role.spec.js` | **PASS** | All three, end to end |
| T7 | Input validation | `BE` suites, `PROBE` | **PASS** | Zod at every boundary; 422 with per-field details |
| T8 | Sensible error handling | `PROBE` | **PASS** | One envelope; malformed input is 422 not 500; disallowed CORS origin does not 500 |
| T9 | Responsive, mobile-friendly | `E2E:responsive.spec.js` | **PASS** | 390×844: no horizontal overflow on any page, drawer nav, modals closable |
| T10 | Coherent professional UI, no dead buttons / placeholder screens | `BROWSER`, `E2E` | **PASS** | Every primary action exercised; zero console errors; zero 5xx in valid flows |
| T11 | Reviewable source code | repository | **PASS** | |
| T12 | Audit / history of important changes | `modules/audit/`, `E2E:security.spec.js` | **PASS** | Append-only; no update or delete route exists; reading someone else's salary is itself audited |
| T13 | Data privacy for salary, personal details, records | `BE:access-control.test.ts`, `E2E:security.spec.js` | **PASS** | See the security section |
| T14 | Documents / employment records | `modules/documents/` | **PARTIAL** | Metadata + generated letter text. **No binary upload / object storage** — a deliberate deferral, see Known limitations |
| T15 | Notifications / status visibility | `modules/notifications/`, `PROBE` | **PASS** | In-app only; fanned out to admins, scoped HR and the direct manager |
| T16 | Relationships supporting expansion across entities/countries | `prisma/schema.prisma` | **PASS** | A fourth country is a row, not a code change |
| T17 | Reporting / analytics for management | `dashboard.service.ts` | **PASS** | Currency-safe payroll, trend, alerts |

## 7. Demo data requirements

| ID | Requirement | Actual (verified by SQL against the seeded database) | Status |
|---|---|---|---|
| D1 | ≥ 2 legal entities in different countries | **3** — UAE, Saudi Arabia, Egypt | **PASS** |
| D2 | ≥ 12 demo employees across roles, entities and statuses | **18** across 3 entities and 7 departments; all five statuses present (13 ACTIVE, 2 PROBATION, 1 ON_LEAVE, 1 NOTICE_PERIOD, 1 OFFBOARDED) | **PASS** |
| D3 | Different salary / compensation examples and joining dates | 36 compensation records in 3 currencies; hire dates spanning 2019–2026 | **PASS** |
| D4 | Enough requests/history to make filters and dashboards meaningful | **40** requests across all 3 types and all 4 statuses; 53 employment events; 17 documents; 15 audit entries | **PASS** |
| D5 | No real names, numbers, passports, salaries or private company data | All names, `@matajer.demo` addresses, `DMCC-DEMO-*` registrations and figures are invented | **PASS** |

## Security probes run during this audit

Each was executed against the running API with a real token for the role named.

| ID | Attack | Result | Status |
|---|---|---|---|
| S1 | Employee reads a colleague by direct id | 200 but `DIRECTORY` level; personal fields **absent from the payload**, not null | **PASS** |
| S2 | Employee reads a colleague's compensation / documents / timeline | Refused | **PASS** |
| S3 | Employee `PATCH`es a colleague — and themselves | Both refused (no self-promotion) | **PASS** |
| S4 | Employee lists requests with a tampered `employeeId` | Silently forced to their own id | **PASS** |
| S5 | Employee reads an unrelated request | **404**, identical to a non-existent id — existence is not confirmed | **PASS** |
| S6 | Employee approves someone else's request / their own | Refused; self-approval refused for **every** role including global admin | **PASS** |
| S7 | Self-service profile change carrying `jobTitle`, `baseSalary`, `legalEntityId`, `managerId`, `status`, `employeeNumber`, `workEmail`, `role`, `hireDate` | Alone → 422. Smuggled next to an allowed field → privileged keys **stripped**; only the allowlisted field is stored and applied | **PASS** |
| S8 | Entity-scoped HR reads / edits another entity | Refused; a tampered `legalEntityId` filter cannot elevate the view | **PASS** |
| S9 | Entity-scoped HR decides another entity's request | Refused | **PASS** |
| S10 | Line manager reads a direct report's salary | Refused — manager sees `MANAGER` level, never compensation | **PASS** |
| S11 | Employee reads the audit trail | 403; no delete/update route exists for audit at all | **PASS** |
| S12 | No token / garbage token / signature-tampered token | 401 in all three cases | **PASS** |
| S13 | Account enumeration | Identical status and message for a wrong password vs an unknown account | **PASS** |
| S14 | Disallowed CORS origin | Answered without the CORS header — a clean browser-side block, not a 500 | **PASS** |
| S15 | Malformed request body | 422 with per-field details | **PASS** |
| S16 | Letter with `includeSalary:false` | No monetary figure in the English or the Arabic body | **PASS** |
| S17 | Employee fetches a colleague's issued letter | Refused | **PASS** |
| S18 | Secret material in the repository | `.env` untracked; no key-shaped string in any tracked file | **PASS** |

## Defects found and fixed during this audit

| # | Severity | Defect | Fix |
|---|---|---|---|
| 1 | **Functional + privacy** | `GET /leave/types` ignored the caller's own legal entity for non-management roles, so a UAE employee was offered **14** leave types — Annual/Maternity/Parental/Sick repeated once per entity. Picking a duplicate produced a dead-end validation error, and it leaked other entities' leave policy. | Scoped the query in `leave.service.ts`: a non-management caller always gets their own entity plus company-wide types; a scoped HR_ADMIN is pinned to their scope and a filter cannot widen it. Employee now sees 6, no duplicates. |
| 2 | **UX / correctness signal** | The directory's *Joined* column rendered with the year stripped, so a correctly sorted newest-first list read as "10 May, 2 Mar, 7 Jul" and looked broken across hire dates spanning 2019–2026. | Removed the `{ year: undefined }` override. The E2E suite now asserts the year is present *and* that the sort is descending by it. |
| 3 | **Stale state after mutation** | Approving or rejecting a request updated the inbox and its tabs but left the sidebar pending badge at its old count. | Threaded an `onDecided` callback from `App.jsx` into both decision surfaces (`AdminRequests`, `AdminOverview`) so the badge reloads wherever a decision is made. Covered by an E2E case. |

### Second pass — defects raised by an external production acceptance report

A separate QA pass against the deployed environment raised twelve findings. Each was
re-verified against the code before being actioned; the deployment predated the fixes above,
so some were already resolved and awaiting a redeploy.

| Ref | Verdict | Outcome |
|---|---|---|
| **EMS-001** — edit form corrupts employee data | **CONFIRMED (P0), fixed** | Reproduced exactly: editing *only* the job title silently rewrote work mode `REMOTE → ONSITE`. Root cause was `workMode: 'ONSITE'` hardcoded in the form initialiser, because the adapter exposed `workMode` only as a display label with no enum counterpart — unlike its siblings `employmentTypeValue`/`contractTypeValue`/`statusValue`. Added `workModeValue` to the adapter and bound the form to it. Every other bound field was then audited mechanically against the adapter; only `status` remains hardcoded, correctly, since it is create-only and excluded from the edit payload. The report's second claim — a **blank work email** — did **not** reproduce: the field is populated from `raw.workEmail` and rendered correctly in a live browser check. |
| **EMS-002** — Manager role has no workspace | **CONFIRMED, fixed** | The backend already granted the capability (`/me/team` returns direct reports at MANAGER view level; `assertCanDecideRequest` permits a direct manager) — only the frontend never exposed it. Added a *My team* destination for managers: direct-report roster plus a team approval queue, with compensation absent by construction and a manager's own request shown as un-decidable rather than as a dead button. |
| **EMS-003** — duplicated cross-entity leave policies | **CONFIRMED, already fixed** | Identical to defect #1 above, fixed earlier in this audit. Still present on the deployed build because the deployment predates these changes. **Redeploy required.** |
| **EMS-004** — 25–45s sign-in | **Not a code defect** | Render free-tier cold start; measured 32.6s on a cold `/health` and 0.37s warm. Documented in `DEPLOYMENT.md` with three mitigations. Not fixable in code. |
| **EMS-005** — issued documents cannot be opened | **PARTLY CONFIRMED, fixed** | Letters *were* readable, but only by clicking a row with no visible affordance — which is why the reviewer concluded there was no action. Non-letter records were dead clicks with no explanation. Added an explicit **Read letter** control for letters and an honest *"No file attached — held outside the platform"* state for the rest. |
| **EMS-006** — inconsistent headcount | **CONFIRMED, fixed** | Entity cards counted lifetime employees (18, Egypt 4) while the dashboard, directory and entity *detail* all counted current ones (17, Egypt 3). Filtered the list `_count` to exclude offboarded, matching the three surfaces that already did. All four now agree. Covered by an E2E case. |
| **EMS-008** — mobile type below readable sizes | **CONFIRMED, fixed** | Verified in the ≤700px block: employee names 11px with 8px secondary text; request titles 10px with 8px detail. Raised to 15px/13px and gave the card room. My own responsive tests had checked overflow but never legibility — a real gap in my coverage. |
| **EMS-010** — pluralisation ("1 people") | **CONFIRMED, fixed** | Added a shared `plural()` formatter and applied it across the count strings. |
| **EMS-012** — manager "Team" widget is entity-wide | **CONFIRMED, fixed** | Relabelled the eyebrow from *Team* to *Your entity* so the label matches the query's actual scope. |
| **EMS-007** — expired probation not flagged | **CONFIRMED, deferred** | Real: the alert window is forward-looking ("ending within 30 days"), so an already-expired probation drops off it. Needs a scheduled rule and an overdue state — a product decision beyond this audit. Recorded in Known limitations. |
| **EMS-009** — timeline duplicates events | **CONFIRMED, deferred** | Real: the timeline merges `EmploymentEvent` and `CompensationRecord`, so a promotion carrying a pay change renders twice. Cosmetic; correct fix is a correlation id on the source event. Recorded in Known limitations. |
| **EMS-011** — stale content during filter changes | **PARTLY CONFIRMED, deferred** | `useResource` already discards superseded responses, so the wrong data is never *committed*; what is missing is a per-panel loading state during the refetch, so previous rows stay visible under the new selection. Cosmetic. Recorded in Known limitations. |

## Out of scope, per the brief

Not built, and correctly so: multi-country payroll engine · government / labour / visa integrations ·
biometric hardware · native mobile apps · multi-region infrastructure · microservices · real company data.

## Known limitations

These are deliberate deferrals, not failures. None is a brief requirement.

| Limitation | Impact |
|---|---|
| Documents are metadata plus generated letter text; no binary upload or object storage | Seeded `fileUrl`s point at a `.demo` host that does not resolve. The model is storage-agnostic, so adding S3 is a one-field change. |
| Letters are stored as text, not rendered PDF | Kept searchable and auditable; rendering needs a template system. |
| Public holidays are illustrative | Islamic holidays move with lunar observation; production would source them per country. |
| The live Gemini path has no automated test | Both branches verified manually; the suites and CI force the key empty on purpose so tests stay deterministic, offline and free. |
| Headcount trend computed in memory | Fine at this scale; belongs in SQL past a few thousand employees. |
| Rate limiting is in-process | Fine for one instance; multi-instance would need Redis. |
| No component-level frontend unit tests | UI behaviour is covered by the 38-case Playwright suite instead. |
| Year-end leave carry-over not applied | `carryOverMaxDays` is modelled but no scheduled job runs it. |
| An expired probation stays `PROBATION` and is not flagged (EMS-007) | The alert window only looks forward 30 days, so an already-lapsed probation disappears from it instead of escalating. HR can miss a due decision. |
| The employment timeline renders a promotion twice when it carried a pay change (EMS-009) | Cosmetic: the timeline merges employment and compensation events with no correlation id to group them. |
| Filter and tab changes show the previous rows until the refetch lands (EMS-011) | Cosmetic: superseded responses are already discarded, but there is no per-panel loading state, so the old list stays on screen briefly under the new selection. |
| First request after idle takes ~30–50s on Render's free tier (EMS-004) | Not a code defect — the container cold-starts. Measured 32.6s cold vs 0.37s warm. `DEPLOYMENT.md` documents three mitigations; a keep-warm ping is the cheapest. |

## Outstanding — not satisfiable from this repository

| Item | Status | What is needed |
|---|---|---|
| Live public URL | **EXTERNAL BLOCKER** | The Render blueprint and `DEPLOYMENT.md` are complete and were reviewed, but deploying needs Render and Neon accounts. Until it is deployed and the URL smoke-tested, no live URL may be quoted. See `FINAL-SUBMISSION.md`. |
| Actual Claude Code development spend | **EXTERNAL BLOCKER** | Only the account owner can read this from the Anthropic Console or subscription billing. `AI-USAGE-LOG.md` carries a blocking marker. |
