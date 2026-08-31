# Matajer Employee Management Platform

A central place for management to see who works for the company and under which legal
entity, and for every employee to answer *what am I owed* and *what happened to my request*
without emailing HR.

Built for the Matajer AI product engineering assessment.

---

## Live demo

**<https://ems-web-dm5w.onrender.com>**

> Two caveats. The first load after an idle period takes roughly 30–50 seconds while
> Render's free tier wakes the container (measured 32.6s cold, 0.37s warm). And the deployed
> build predates the fixes in this repository's latest commits — **redeploy both services
> before an evaluator sees it**. See [`FINAL-SUBMISSION.md`](FINAL-SUBMISSION.md).

## Demo accounts

Every seeded account uses the password **`Passw0rd!23`**.

| Role | Email | What it shows |
|---|---|---|
| **Admin** | `admin@matajer.demo` | Everything, across all three legal entities |
| **Employee** | `employee@matajer.demo` | Self-service only |
| Scoped HR | `hr.ksa@matajer.demo` | The Saudi entity only — proves the entity boundary is enforced |
| Manager | `manager@matajer.demo` | A *My team* workspace: direct reports and their pending requests, with deliberately **no** access to their salaries |

The login page has one-click fillers for the Admin and Employee accounts. Every other
seeded employee can sign in as `first.last@matajer.demo` with the same password.

---

## The decision that shapes the product

**The legal entity carries policy, not just a name.** `LegalEntity` owns the working week,
the public-holiday calendar, the currency, the probation length and the notice period.

The payoff is visible in the product: the same eight-day leave request costs

- **3 days** for a UAE employee — Mon–Fri week, three national holidays in range
- **6 days** for a Saudi employee — Sun–Thu week, none in range

There is no country-specific branch anywhere in the request code. Adding a fourth country
is inserting a row.

## Main features

**Management** — dashboard with headcount, entity and department splits, a 12-month trend
and an alerts surface (probation ending, contracts ending, visas expiring, requests stale
beyond five days) · directory with server-side search, filter, sort and pagination ·
employee create and edit, every change writing a timeline event and an audit row · full
profile with dated compensation history behind its own permission gate · one unified
approval inbox across all three workflows · legal-entity view with payroll reported per
currency and **never summed across them** · immutable audit trail.

**Employee** — own profile, employment record and compensation · leave balances with a live
preview that shows chargeable days and names the holidays it skipped · three self-service
workflows (leave, documents/letters, profile changes), each submit → status → decision ·
in-app notifications.

**Line managers** — a *My team* workspace listing direct reports and the requests awaiting
their decision. They approve for their team but never see a report's pay, and their own
request is shown as un-decidable rather than as a button that would be refused.

**Privacy** — four roles, every authorization decision in one readable file
([`services/access.ts`](Employee%20Management%20Platform%20BackEnd/src/services/access.ts)).
A line manager cannot see a report's salary. Colleagues get an address book, not a wall —
and personal fields are *absent* from that payload rather than null. Reading someone else's
salary is itself audited. Nobody approves their own request, including a global admin.

**AI (optional, not required by the brief)** — on approval of a document request, Google
Gemini (`gemini-2.5-flash`) drafts the letter in English and Arabic from the employee's real
record. A deterministic template is the floor: **with no `GOOGLE_API_KEY` the feature
degrades to templates and the product works exactly the same**, which is why the demo needs
no credentials. Salary is placed in the prompt only when the employee asked for it to be
stated, so an unauthorised figure cannot be leaked — it was never there. HR always sees
whether a draft was machine-written before signing.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite | Fast, no framework ceremony for an SPA this size |
| API | Express 4 + TypeScript | Ordinary middleware and functions; no magic to explain |
| Database | PostgreSQL 17 + Prisma 6 | Deeply relational data; constraints and transactions do real work |
| Validation | Zod | One schema per endpoint; types inferred from the same declaration |
| Auth | Backend-owned JWT + rotating refresh tokens | Rules live in code that can be read and tested, not in vendor config |
| Tests | Vitest + Supertest + Playwright | Supertest mounts the real app; Playwright drives the real stack |

## Quick local setup

Requires Node 20+ and Docker.

```bash
cd "Employee Management Platform BackEnd" && npm install && cp .env.example .env && npm run db:up && npx prisma migrate deploy && npm run db:seed && npm run dev
```

```bash
cd "Employee Management Platform FrontEnd" && npm install && npm run dev
```

Open <http://localhost:5173>. The API is on `http://localhost:4000`, health at `/health`.
Vite proxies `/api` to the backend, so no frontend environment variable is needed locally.

## Test commands

```bash
cd "Employee Management Platform BackEnd" && npm run typecheck && npm test && npm run build
```

```bash
cd "Employee Management Platform FrontEnd" && npm test && npm run build
```

```bash
cd e2e && npm install && npx playwright install chromium && npm test
```

The E2E suite builds and seeds its own `ems_e2e` database and boots both servers itself, so
it never touches the demo data you are looking at. All three run in CI on every push
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Testing summary

Verified by execution on **31 August 2026**:

| Suite | Result |
|---|---|
| Backend integration (Vitest + Supertest, real PostgreSQL) | **118 / 118 passing** |
| Frontend unit (adapters, HTTP client, formatters) | **34 / 34 passing** |
| E2E acceptance (Playwright, real stack, 1440×900 + 390×844) | **33 / 33 passing** |
| TypeScript typecheck · backend build · frontend production build | **clean** |
| Migrations + seed from an empty database | **verified** |

Also verified by hand: 18 live authorization/IDOR probes against the running API (all
refused correctly), the UAE-vs-Saudi leave arithmetic recounted independently against each
entity's own calendar, and the AI letter path in **both** states — with a real API key
(Gemini drafts it, flagged `isAiGenerated: true`) and with the key removed (deterministic
template, flagged `false`). Browser QA across every admin and employee destination found
zero console errors and zero failed API requests.

Full requirement-by-requirement evidence, including the three defects this audit found and
fixed: **[`docs/SPEC-COMPLIANCE.md`](docs/SPEC-COMPLIANCE.md)**.

## Architecture

```
Request
  ├─ helmet · cors · compression · body parsing
  ├─ requestId · structured logging · rate limiting
  ├─ authenticate      verifies the JWT, then re-reads the user every request
  ├─ controller        parses input with Zod, no business logic
  ├─ service           authorization, business rules, transactions
  ├─ serializer        decides which fields the caller may see
  └─ errorHandler      one place where an error becomes a response
```

Route-level role gates are coarse. The real decision is always made per record in the
service, because "a manager may approve for their team but not for themselves" cannot be
expressed as a role check on a URL.

**Data model** — `LegalEntity` is the organisational root. `User` (auth) is separate from
`Employee` (HR record). Compensation lives in its own dated table, so the default serializer
*physically cannot* leak salary. Requests use one supertype plus a typed detail table per
kind, so the admin inbox is a single indexed query while leave keeps real date columns.

## Documentation

| Document | What it covers |
|---|---|
| [PRODUCT-SUMMARY.md](PRODUCT-SUMMARY.md) | What was built and the product decisions behind it |
| [Research and decisions](Employee%20Management%20Platform%20BackEnd/docs/research-and-decisions.md) | BambooHR, Deel/Rippling, Personio/Zoho — what was taken, what was deliberately not copied, and MVP vs later |
| [docs/SPEC-COMPLIANCE.md](docs/SPEC-COMPLIANCE.md) | Every brief requirement, its evidence, and its status |
| [AI-USAGE-LOG.md](AI-USAGE-LOG.md) | AI tools, what they did, and spend |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Render + Neon, free tier, ~15 minutes |
| [Backend README](Employee%20Management%20Platform%20BackEnd/README.md) | Data model, permission matrix, full API reference |
| [Frontend README](Employee%20Management%20Platform%20FrontEnd/README.md) | Frontend architecture and product surface |
| [FINAL-SUBMISSION.md](FINAL-SUBMISSION.md) | The submission message, and what must be filled in first |

## Known limitations

Documents are metadata plus generated letter text — no binary upload or object storage yet ·
letters are stored as text rather than rendered PDFs · public holidays are illustrative
(Islamic dates move with lunar observation) · the headcount trend is computed in memory ·
rate limiting is in-process · the live Gemini call has no automated test, by design, so the
suites stay deterministic and free.

Full list with impact in [`docs/SPEC-COMPLIANCE.md`](docs/SPEC-COMPLIANCE.md).
