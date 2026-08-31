# Employee Management Platform — Backend

REST API and data layer for a multi-entity Employee Management Platform. Built for the Matajer AI product engineering assessment.

The platform gives management one reliable view of who works for the company and under which legal entity, and gives every employee a self-service area where they can see their own record and raise requests without emailing HR.

---

## Contents

- [Quick start](#quick-start)
- [Stack and why](#stack-and-why)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Permissions and privacy](#permissions-and-privacy)
- [The three self-service workflows](#the-three-self-service-workflows)
- [API reference](#api-reference)
- [Demo data and accounts](#demo-data-and-accounts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Product decisions](#product-decisions)
- [Known limitations](#known-limitations)

---

## Quick start

Requirements: Node 20+, Docker (for Postgres).

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run db:up
```

```bash
npx prisma migrate deploy && npm run db:seed
```

```bash
npm run dev
```

The API is then on `http://localhost:4000`, with a health check at `/health` and the route index at `/api/v1`.

Sign in to get a token:

```bash
curl -X POST http://localhost:4000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@matajer.demo","password":"Passw0rd!23"}'
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm start` | Compile to `dist/` and run the compiled output |
| `npm run typecheck` | TypeScript with no emit |
| `npm test` | Full test suite (needs the test database container) |
| `npm run db:up` / `db:down` | Start / stop the Postgres containers |
| `npm run db:migrate` | Create and apply a migration after a schema change |
| `npm run db:seed` | Load the demo data |
| `npm run db:reset` | Drop, re-migrate and re-seed the development database |
| `npm run db:studio` | Prisma Studio, a browser UI over the data |

`docker compose` starts two databases: development on port **5433** and a throwaway test database on **5434**. They are separate so `npm test` can never destroy the demo data.

---

## Stack and why

| Choice | Reason |
|---|---|
| **TypeScript + Express 4** | The most widely understood Node server. Every layer here is ordinary middleware and functions — there is no framework magic to explain, which matters when the code has to be defended line by line. |
| **PostgreSQL 17** | The data is deeply relational: employees to entities, requests to employees, balances to leave types. Constraints, transactions and `groupBy` do real work here rather than being reimplemented in application code. |
| **Prisma 6** | Type-safe queries generated from one schema file that doubles as the readable definition of the data model, plus a real migration history. |
| **Zod** | One schema per endpoint, validated at the boundary, with the TypeScript type inferred from the same declaration — so validation and types cannot drift apart. |
| **Backend-owned JWT** | The API owns users, bcrypt hashes and tokens. Authorization lives in code that can be read, tested and explained, rather than in database policies. It also keeps the project portable: nothing is tied to a specific auth provider. |
| **Vitest + Supertest** | Fast, and Supertest mounts the Express app directly, so tests exercise real routing, middleware, validation and database writes rather than mocks. |

**Why not Supabase Auth or row-level security?** RLS is a strong mechanism, but it moves the authorization rules into SQL policies. For an assessment where the privacy design is the thing being judged, having every rule in one readable file ([`src/services/access.ts`](src/services/access.ts)) with tests pointed at it is worth more. It also avoids coupling the whole product to one vendor.

**Why not NestJS?** It would add decorators, dependency injection and module boilerplate for a service of this size. The layering here is explicit and achieves the same separation with less to justify.

---

## Architecture

```
Request
  │
  ├─ helmet · cors · compression · body parsing
  ├─ requestId          correlation id, echoed as X-Request-Id
  ├─ httpLogger         structured pino logging
  ├─ rate limiting      strict on /auth, broad on /api
  │
  ├─ authenticate       verifies the JWT, then re-reads the user
  ├─ requireRole        coarse role gate at the router
  │
  ├─ controller         parses input with Zod, no business logic
  ├─ service            authorization, business rules, transactions
  ├─ serializer         decides which fields the caller may see
  │
  └─ errorHandler       one place where an error becomes a response
```

```
src/
├── app.ts                  Express app factory (mounted directly by tests)
├── server.ts               Boot, graceful shutdown
├── routes.ts               Mounts every /api/v1 router
├── config/                 Validated env, logger
├── db/                     Prisma client singleton
├── common/                 Errors, response envelope, validation helpers
├── middleware/             auth, error handling, request context, rate limits
├── services/               Cross-cutting: access rules, audit, notifications,
│                           working-day arithmetic
└── modules/                One folder per domain area
    ├── auth/               login, refresh rotation, password change
    ├── employees/          directory, profile, timeline, status changes
    ├── compensation/       salary history behind its own permission gate
    ├── legal-entities/     the multi-country root
    ├── departments/
    ├── leave/              policy, holidays, balances, calendar
    ├── requests/           the approval engine for all three workflows
    ├── documents/
    ├── dashboard/          management analytics and alerts
    ├── notifications/
    ├── audit/              read-only trail
    └── me/                 self-service, resolved from the token
```

**Module convention.** Every module has a `*.service.ts` holding the business rules and a `*.routes.ts` declaring the endpoints. The two modules with non-trivial request and response shaping — `auth` and `employees` — additionally have a `*.controller.ts`. Smaller CRUD modules keep their thin handlers in the router rather than adding a file that would only forward a call.

**Where the rules live.** Route-level `requireAdmin` is a coarse gate. The real decision is always made in the service, per record, because a rule like "a manager may approve for their own team but not for themselves" cannot be expressed as a role check on a URL.

### Cross-cutting decisions worth knowing

**The authenticate middleware re-reads the user on every request.** The JWT is verified first, then the user is loaded from the database. That is an extra query per request, and it is deliberate: a deactivated account, a changed role or a revoked entity scope takes effect on the next request instead of whenever a 15-minute token happens to expire. Offboarding someone should log them out now, not eventually.

**Refresh tokens are stateful and rotate.** The access token is a short-lived JWT so middleware can reject a bad token without touching the database. The refresh token is opaque random bytes stored as an HMAC — being stateful is the point, since it can be revoked. Every use rotates it, and presenting an already-used token revokes the entire family on the assumption it leaked.

**Auditing and notifications never fail the action they describe.** Both are wrapped so a write failure is logged and swallowed. A leave approval should not roll back because a notification insert failed. When the audited change runs in a transaction, the audit row joins that transaction, so the trail can never disagree with the data.

**One response envelope.** Success is `{ data, meta? }`; failure is `{ error: { code, message, details?, requestId } }`. The frontend writes one response handler, not one per endpoint. Validation failures return 422 with `details` shaped as `{ field: [messages] }`, which maps straight onto form fields.

---

## Data model

```
LegalEntity ──┬──< Employee >──── User            (1:1 optional — auth only)
              │       │
              │       ├──< CompensationRecord     (dated history, own permission gate)
              │       ├──< EmploymentEvent        (hire, promotion, transfer, exit)
              │       ├──< Document               (expiry drives management alerts)
              │       ├──< LeaveBalance
              │       └──< Request ──┬── LeaveRequestDetail
              │                      ├── DocumentRequestDetail
              │                      └── ProfileChangeRequestDetail
              ├──< LeaveType         (entitlement differs per country)
              └──< Holiday           (public holidays differ per country)

Department · Notification · AuditLog · RefreshToken
```

Five decisions worth defending:

**1. `LegalEntity` is the organisational root, and it carries policy.** Not just a label on an employee — it owns the working week, the public holiday calendar, the currency, the probation length and the notice period. Adding a fourth country is inserting a row, not changing code. The payoff is concrete: the same 8-day leave request costs **3 days in the UAE entity** (Mon–Fri week, three national holidays in range) and **6 days in the Saudi entity** (Sun–Thu week, no holidays in range). One `workWeek` column drives that.

**2. `User` and `Employee` are separate tables.** Not every employee needs a login, an HR admin need not be an employee, and an offboarded person keeps their employment record while losing their access. The link is 1:1 and optional. It also lets a login email differ from a work email, which is how the demo accounts work.

**3. Compensation lives in its own table.** Salary is the most sensitive field in the system. Keeping it out of the employee row means the default employee serializer physically cannot leak it — a new field added to `Employee` later cannot accidentally expose pay. As a bonus it gives dated salary history for free: each change closes the previous record the day before the new one starts, so the table answers "what were they paid on this date" and history cannot be rewritten.

**4. Requests use a supertype plus typed detail tables.** A single `Request` table holds what every workflow shares — reference, status, requester, submitted/decided timestamps, decision note — so the admin inbox is one indexed query across all three types. Each type then has a 1:1 detail table with real columns, so leave keeps proper `startDate`/`endDate`/`workingDays` for calendars and balance arithmetic instead of a JSON blob nobody can query.

**5. The current state is denormalised onto `Employee`, with events beside it.** `Employee` holds the current job title, manager, status and entity; `EmploymentEvent` records each change as a business event. This avoids the "which of these rows is the current one" bug class that comes with modelling employment purely as a list of contracts, while still producing a real timeline.

Enums are used wherever the set of values is fixed and business-meaningful (`EmployeeStatus`, `RequestStatus`, `EmploymentType`, `AuditAction`, …), so invalid states are rejected by the database rather than by convention. Money is `Decimal(12,2)`, never a float.

The schema is [`prisma/schema.prisma`](prisma/schema.prisma), annotated throughout.

---

## Permissions and privacy

Four roles:

| Role | Scope |
|---|---|
| `ADMIN` | Every legal entity. Full management capability. |
| `HR_ADMIN` | Same capability, optionally pinned to one legal entity via `scopedLegalEntityId`. |
| `MANAGER` | Direct reports: their records and their requests. **Never compensation.** |
| `EMPLOYEE` | Their own record, plus a limited company directory. |

Every authorization decision is made by a function in [`src/services/access.ts`](src/services/access.ts). Keeping them in one file means the privacy rules can be read in a sitting and tested directly, instead of being scattered across controllers where a missing check is invisible.

### What each caller sees on an employee record

| | Directory<br>(any colleague) | Manager<br>(direct report) | Full<br>(self / HR in scope) |
|---|:---:|:---:|:---:|
| Name, job title, department, entity, work email | ● | ● | ● |
| Phone, hire date, contract type, notice period | | ● | ● |
| Date of birth, nationality, home address, emergency contact | | | ● |
| Documents | | | ● |
| **Compensation** | | | ● |
| Linked login account | | | HR only |

Three things worth calling out:

**Employees can see a directory, not a wall.** Any authenticated user can look up a colleague's name, title, department and work email — the same information a company address book shows, and how real HRIS products behave. Personal identity data and pay are absent from the response entirely, not merely null, because the serializer names fields explicitly and never spreads the database row.

**A line manager cannot see their report's salary.** This is a deliberate product decision, not an oversight. Managers get the working context they need to plan around their team; pay conversations belong to HR. It is asserted in the test suite so it cannot regress quietly.

**Reading someone else's salary is itself audited.** Who *looked* at a salary matters as much as who changed it. Reading your own is not logged — it is not noteworthy — but any other actor produces a `VIEW_SENSITIVE` entry. There is no update or delete endpoint for the audit trail anywhere in the API; a trail that can be edited proves nothing.

Two further rules apply to the approval flow: **nobody may decide their own request**, including a global admin, and an unrelated request returns **404 rather than 403** — confirming that a reference exists would itself be a leak.

---

## The three self-service workflows

Chosen after reviewing how BambooHR, Deel/Rippling and Personio structure employee self-service. The brief asks for at least two; these three share one approval engine, so the admin gets a single unified inbox rather than three disconnected queues.

### 1. Leave requests

The highest-volume HR workflow, and the only one that forces the legal-entity model to do real work.

- `POST /requests/leave/preview` shows the chargeable days **before** the employee commits, using their own entity's working week and holiday calendar — so the number they see is the number that gets deducted.
- Submitting **holds** the days as `pendingDays`. This is what stops someone booking the same twenty days three times while the first request sits in an approver's queue.
- Approval converts the hold into `usedDays`; rejection or withdrawal returns them. The total charged never changes.
- Validated on submit: overlapping dates, insufficient balance (counting pending), ranges with no working days, leave types belonging to another entity, gender-restricted types, notice periods, maximum consecutive days, and required attachments.
- Leave spanning two calendar years is refused with a clear message. Balances are tracked per year, and silently splitting the deduction would make the accounting wrong.

### 2. Document and letter requests

Salary certificate, employment certificate, experience letter, NOC for travel, visa support letter, bank account letter. Ubiquitous in GCC operations and genuinely tedious to chase by email.

On approval the system creates the `Document` record, links it back to the request, and it appears in the employee's own documents list. A salary certificate forces `includeSalary` on — asking for one without it produces a letter that does not serve its purpose.

### 3. Profile change requests

The employee proposes a change to their own phone, address, city, personal email or emergency contact. On approval the system **applies** it to the employee record and stamps `appliedAt`.

The interesting part is what is *not* in the schema: job title, salary, legal entity, manager and employment status are absent, so they cannot be smuggled through self-service. The allowlist is re-checked at apply time as well as at submit time, because that is the write that actually touches the employee row. Each proposed change is captured with its current value, so the approver reviews a real before/after rather than a list of new values with no context.

---

## API reference

Base path `/api/v1`. All routes except `/health`, `/auth/login` and `/auth/refresh` require `Authorization: Bearer <accessToken>`.

<details>
<summary><b>Auth</b></summary>

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | Returns access + refresh tokens and the profile |
| POST | `/auth/refresh` | Rotates the refresh token |
| POST | `/auth/logout` | Revokes the presented token, or all sessions |
| GET | `/auth/me` | Current user and linked employee |
| POST | `/auth/change-password` | Revokes all other sessions |
</details>

<details>
<summary><b>Employees</b></summary>

| Method | Path | Notes |
|---|---|---|
| GET | `/employees` | Search, filter, sort, paginate |
| POST | `/employees` | HR only. Optionally creates a login and starting salary |
| GET | `/employees/:id` | Field set depends on the caller |
| PATCH | `/employees/:id` | HR only. Writes timeline events and an audit diff |
| POST | `/employees/:id/status` | Status change with a reason; offboarding disables the login |
| GET | `/employees/:id/timeline` | Employment events, decided requests, salary changes |
| GET | `/employees/:id/reports` | Direct reports |
| GET | `/employees/:id/leave-balances` | Self, manager or HR |
| GET / POST | `/employees/:id/compensation` | Self or HR to read; HR only to write |
| GET / POST | `/employees/:id/documents` | |
| GET | `/documents/:id` | Letter body (English + Arabic). Employee's own, or HR in scope |
| DELETE | `/documents/:id` | HR only |

List parameters: `q`, `legalEntityId`, `departmentId`, `managerId`, `status`, `employmentType`, `workMode`, `includeOffboarded`, `sortBy` (`name`/`hireDate`/`jobTitle`/`employeeNumber`/`status`), `sortOrder`, `page`, `pageSize`. Multi-value filters accept both `?status=A&status=B` and `?status=A,B`.
</details>

<details>
<summary><b>Requests</b></summary>

| Method | Path | Notes |
|---|---|---|
| GET | `/requests` | Unified inbox. Returns `summary` with per-status counts |
| POST | `/requests/leave/preview` | Chargeable days for a date range |
| POST | `/requests/leave` | |
| POST | `/requests/document` | |
| POST | `/requests/profile-change` | |
| GET | `/requests/:id` | |
| POST | `/requests/:id/approve` | HR or the direct manager, never the requester |
| POST | `/requests/:id/reject` | Reason required |
| POST | `/requests/:id/cancel` | Owner, while still pending |

Filters: `type`, `status`, `employeeId`, `legalEntityId`, `departmentId`, `myTeamOnly`, `from`, `to`, `q`, `sortBy`, `sortOrder`, `page`, `pageSize`.
</details>

<details>
<summary><b>Self-service, organisation and analytics</b></summary>

| Method | Path | Notes |
|---|---|---|
| GET | `/me/dashboard` | Role-appropriate home screen |
| GET | `/me/profile` · `/me/timeline` · `/me/leave-balances` · `/me/documents` · `/me/requests` · `/me/team` | Resolved from the token — there is no id to tamper with |
| GET · POST · PATCH | `/legal-entities` | Create is `ADMIN` only. `GET /:id` includes headcount breakdowns |
| GET · POST · PATCH | `/departments` | Headcount counted within the caller's entity scope |
| GET · POST · PATCH | `/leave/types` | Per-entity leave policy |
| GET · POST · DELETE | `/leave/holidays` | |
| GET | `/leave/calendar?from=&to=` | Shared absence calendar; reasons hidden from colleagues |
| GET | `/dashboard` | Management or employee view by role |
| GET | `/dashboard/alerts` | Probation, contracts, expiring documents, stale requests, anniversaries |
| GET | `/dashboard/compensation-overview` | Payroll cost per entity, grouped by currency |
| GET · POST | `/notifications`, `/notifications/:id/read`, `/notifications/read-all` | |
| GET | `/audit-logs` | Management only, read-only |
</details>

### Management analytics

`GET /dashboard` returns headcount by status, entity, department and employment type; hires in the last 30 days and exits in the last 90; average tenure; a 12-month headcount trend; pending requests by type; and how many people are away today as a share of the workforce.

`GET /dashboard/alerts` is the reminders surface the brief asks for — probation periods ending within 30 days, contracts ending within 90 (chosen over 60 because two entities carry 60-day notice periods, so a shorter window would surface a renewal too late to act on), documents such as visas and permits expiring within 90 days, requests pending more than five days, plus upcoming work anniversaries and birthdays.

`GET /dashboard/compensation-overview` reports payroll cost **grouped by currency and never summed across currencies**. A single total across AED, SAR and EGP would be meaningless without an exchange rate, and inventing one would be worse than omitting it. Pay frequencies are normalised to a monthly figure so entities are comparable.

---

## AI letter drafting

When a document request is approved, the letter body is drafted by **Google Gemini**
in **English and Arabic** from the employee's actual record, and stored on the
document.

Three rules govern it:

1. **The template is the floor, the model is the ceiling.** Every letter type has
   a deterministic template that always produces a valid, signable letter. Set no
   `GOOGLE_API_KEY` and the feature degrades to templates - the platform is
   fully functional either way, which is why the demo needs no credentials.
2. **The model never sees data the letter may not contain.** Salary is passed only
   when the employee asked for it to be stated. Nothing is redacted after the
   fact, because the sensitive value was never in the prompt.
3. **Facts come from the database, never the model.** The prompt carries the
   employment record as structured values and forbids invention; the response is
   schema-constrained. A second check rejects any draft that introduces a
   monetary figure when none was authorised, and falls back to the template.

Letters are stored as text rather than a rendered file, so they stay searchable
and auditable and can be re-rendered to PDF later without regeneration. The UI
labels a machine-drafted letter so HR knows what it is reviewing before signing.

Model: **`gemini-2.5-flash`** with thinking disabled (`thinkingBudget: 0`) and
`temperature: 0.2` - a legal letter should be predictable, not creative, and
filling a fixed structure from supplied facts needs no reasoning budget. Output
is constrained with `responseJsonSchema` and re-validated with Zod on the way
back, because constraining the request is not the same as trusting the response.

At $0.30/1M input and $2.50/1M output, a letter (~600 in, ~800 out) costs about
**$0.002 - a fifth of a cent**. Google also offers a free tier, so the demo
typically costs nothing. As delivered the cost is $0.00: no key is configured and
the templates are used.

Implementation: [`src/modules/ai/letter.service.ts`](src/modules/ai/letter.service.ts).

To enable it, get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
and set `GOOGLE_API_KEY` in `.env`.

---

## Demo data and accounts

`npm run db:seed` loads a deterministic dataset — no randomness, so a reset always produces the same database:

- **3 legal entities** in three countries with three different working weeks and holiday calendars (UAE Mon–Fri; Saudi Arabia and Egypt Sun–Thu)
- **18 employees** across 7 departments, 3 currencies, hire dates from 2019 to 2026, and every employment status: 13 active, 2 on probation, 1 on leave, 1 on notice, 1 offboarded
- **36 compensation records** — most people have salary history, not just a current figure
- **53 employment events**, **17 documents** (several expiring inside the alert window), **40 requests** across all three types and all four statuses, spread over the year so filters and dashboards are immediately meaningful
- **12 notifications** and a populated audit trail

### Accounts

All share the password `Passw0rd!23`.

| Role | Email | Who they are |
|---|---|---|
| Admin | `admin@matajer.demo` | Priya Raman, Head of People — global scope |
| HR (scoped) | `hr.ksa@matajer.demo` | Huda Al-Qahtani — **sees only the Saudi entity** |
| Manager | `manager@matajer.demo` | Omar Al-Zaabi, VP Engineering — 4 direct reports across 3 entities |
| Employee | `employee@matajer.demo` | Yusuf Karim, Senior Backend Engineer |

Every other employee can also sign in with `first.last@matajer.demo` and the same password.

The scoped HR account is worth trying: it demonstrates that the entity model is enforced, not decorative. Signed in as `hr.ksa@`, the directory returns 6 employees instead of 17, and requesting a UAE employee's compensation returns 403.

All names, addresses, phone numbers, registration numbers and salaries are invented, and the `.demo` domain does not resolve. No real company or personal data appears anywhere.

---

## Testing

```bash
npm test
```

**118 tests across 6 files, all passing.** They run against the separate test database on port 5434 — `npm test` can never touch the demo data.

| File | Covers |
|---|---|
| `working-days.test.ts` | Pure unit tests of the leave arithmetic: differing working weeks, holidays on and off working days, half days at each end, single-day half days, empty and inverted ranges |
| `letters.test.ts` | Letter templates in both languages, the salary-privacy guard and its money detector, and the fallback that runs when no `GOOGLE_API_KEY` is configured |
| `auth.test.ts` | Login, development-origin CORS, account enumeration resistance, refresh rotation, replay detection, lockout after 5 failures, password change, immediate effect of deactivation |
| `access-control.test.ts` | The full privacy matrix — the tests that would catch a serializer regression or a dropped access check |
| `request-workflows.test.ts` | All three workflows end to end, including balance hold/deduct/release and every rejection path |
| `employees.test.ts` | Creation with account and pro-rated balances, update with timeline and audit, reporting cycles, status changes, search/filter/sort/paginate, compensation history |

Integration tests mount the Express app with Supertest, so they exercise real routing, middleware, validation, authorization and database writes — not mocks.

### Manually verified against the running server

Beyond the suite, these flows were driven by hand over HTTP against the seeded database:

- Admin, manager, employee and scoped-HR login; health check with a live database round-trip
- Directory search, multi-status filtering, sorting and pagination
- The permission matrix — every cell in the table above returns the expected status code
- The scoped HR admin seeing 6 of 17 employees and 403 on an out-of-scope record
- Full leave cycle: preview → submit → balance held → self-approval blocked → admin approves → balance deducted → overlap refused
- Document request → approval → issued letter appearing in the employee's documents
- Profile change → approval → value applied to the employee record
- Admin dashboard, alerts and the currency-grouped compensation overview

---

## Deployment

The only coupling to a specific database is `DATABASE_URL`. Point it at any managed Postgres — Supabase, Neon, Railway, RDS — and nothing else changes.

A `Dockerfile` is included: multi-stage build, production dependencies only, runs as a non-root user, and applies pending migrations before accepting traffic.

```bash
docker build -t ems-api .
docker run -p 4000:4000 --env-file .env ems-api
```

A ready-to-apply Render blueprint lives at [`../render.yaml`](../render.yaml), with a
step-by-step walkthrough in [`../DEPLOYMENT.md`](../DEPLOYMENT.md) (Render + Neon, free tier).

For any other platform:

1. Provision a managed Postgres and set `DATABASE_URL`.
2. Generate real secrets — the app **refuses to start in production** on the development JWT secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
3. Set `NODE_ENV=production` and `CORS_ORIGINS` to the deployed frontend origin.
4. Deploy. The container runs `prisma migrate deploy` on start; run `npm run db:seed` once to load the demo data.
5. Point the platform health check at `/health`, which verifies the database round-trip rather than just process liveness.

Every environment variable is validated by Zod at boot ([`src/config/env.ts`](src/config/env.ts)). A missing or malformed value fails the process immediately with a readable message rather than surfacing later as a confusing runtime error.

---

## Product decisions

**Departments are company-wide, not per legal entity.** In a group running one business through several legal entities, Engineering is one function that happens to employ people in the UAE and in Egypt. Modelling it per entity would fragment reporting for no benefit; per-entity headcount is a grouping of the same department instead.

**Status changes are their own endpoint, not a field edit.** Moving someone to `OFFBOARDED` requires a reason and an effective date, writes a timeline event, disables the login and revokes live sessions. That is a business event, not a column update, and the API shape says so.

**Employee numbers are readable and per entity** — `AE-0007`, `SA-0003`. Derived inside the creating transaction and protected by a unique constraint, so correctness comes from the constraint rather than from the read.

**Mid-year joiners get a pro-rated leave entitlement**, rounded to the nearest half day — the convention the HRIS products reviewed all use. Someone joining in September gets 4/12 of the annual allowance.

**Approval is single-stage.** HR or the direct manager can decide; HR can always act. Multi-stage approval chains are real in larger companies but would add configuration UI and state machinery that a focused MVP does not need.

### What I would add next

| Next | Why it was left out |
|---|---|
| File upload to object storage | Documents are metadata plus a URL today. Real upload is infrastructure, not HR domain — the model is storage-agnostic, so it is a one-field change. |
| Generated PDF letters | Approval creates the document record and links it; rendering an actual PDF needs a template system and adds no product insight here. |
| Multi-stage and delegated approval | Configuration UI and state machinery beyond a focused MVP. |
| Org chart endpoint | The data supports it — self-referencing `managerId` with cycle protection — but rendering is a frontend concern. |
| Onboarding and offboarding checklists | High real-world value; a separate task/assignment model. |
| Attendance and timesheets | A large domain of its own; the brief rules out biometric devices. |
| Carry-over and year-end balance rollover | `carryOverMaxDays` is modelled but no scheduled job applies it. Needs a job runner. |
| Email or Slack notification delivery | In-app notifications are complete; the brief does not require real delivery, and adding a provider is integration risk with no demo value. |
| Full-text search | `ILIKE` across six columns is correct and fast at this scale. Postgres `tsvector` would be the move past a few thousand employees. |

---

## Known limitations

**Honest about what is simplified:**

- **Documents are metadata plus a URL.** There is no binary upload or object storage. Seeded file URLs point at a `.demo` host that does not resolve.
- **Approved document requests produce a record, not a rendered PDF.** HR can supply a link to a signed letter; otherwise the record points at a generated placeholder path.
- **Public holidays are illustrative.** Islamic holidays move with lunar observation and are confirmed locally each year. A production system would source them per country from an official calendar; here they are seeded as fixed demo dates.
- **The headcount trend is computed in memory** from hire and exit dates. At prototype scale one readable pass beats a window-function query nobody can safely modify. Past a few thousand employees this should move into SQL.
- **Leave carry-over is modelled but not applied.** `carryOverMaxDays` and `carriedOverDays` exist and are read correctly; no scheduled job rolls balances at year end.
- **Payroll is deliberately out of scope.** Compensation is recorded and reported; there is no country-compliant payroll calculation, and the brief excludes it.
- **No refresh-token cleanup job.** Expired rows accumulate. They are harmless and indexed, but a production system would prune them.
- **Rate limiting is in-process.** Fine for a single instance; a multi-instance deployment would need a shared store such as Redis.
- **`prisma migrate reset` is destructive.** `npm run db:reset` drops and rebuilds the development database. It is not intended for any database holding real data.

---

## Repository notes

The `prisma` block in `package.json` emits a deprecation warning on Prisma 6.19 (it moves to `prisma.config.ts` in Prisma 7). It is cosmetic and the configuration works as intended; migrating it was not worth the risk of changing environment-loading behaviour mid-build.
