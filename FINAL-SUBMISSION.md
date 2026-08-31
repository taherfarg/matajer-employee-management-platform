# Final submission

> [!WARNING]
> **Two things must be done before this is sent.**
>
> 1. **Redeploy.** The environment at the URL below is live and working, but it was built
>    from a commit that predates every fix in this audit — including the duplicated
>    leave-type dropdown, the edit form that silently overwrote work mode, and the manager
>    workspace. Push the current branch and let Render rebuild **both** services, then sign
>    in once and confirm the leave-type dropdown offers six options rather than fourteen.
> 2. **Enter the actual Claude Code and Codex spend** in
>    [`AI-USAGE-LOG.md`](AI-USAGE-LOG.md), which carries three `$____` cells. Neither figure
>    can be derived from the repository and neither may be guessed.
>
> Delete this box once both are done. Everything below is ready to copy as-is.

---

**Project:** Matajer Employee Management Platform

**Live URL:** https://ems-web-dm5w.onrender.com

> First load after an idle period takes roughly 30–50 seconds while Render's free tier wakes
> the container — measured at 32.6s cold against 0.37s warm. Everything after that is
> immediate.

**Repository:** https://github.com/taherfarg/matajer-employee-management-platform

**Admin account**
`admin@matajer.demo` / `Passw0rd!23`

**Employee account**
`employee@matajer.demo` / `Passw0rd!23`

Two extra accounts are seeded to make the permission model visible:
`hr.ksa@matajer.demo` (HR scoped to the Saudi entity only) and `manager@matajer.demo`
(a *My team* workspace with direct reports and team approvals, and deliberately no access to their salaries). Same password.

---

## What was built

A multi-entity employee management platform with two distinct experiences.

**Management** gets a dashboard (headcount, entity and department splits, a 12-month trend,
and alerts for probation endings, contract endings, expiring visas and requests stale beyond
five days), a directory with server-side search, filtering, sorting and pagination, employee
creation and editing where every change writes a timeline event and an audit row, a full
employee profile with dated compensation history behind its own permission gate, one unified
approval inbox across all three workflows, and a legal-entity view reporting payroll per
currency.

**Employees** get their own profile, employment record and compensation, leave balances with
a live preview that shows the chargeable days and names the public holidays it skipped, and
three self-service workflows — leave, documents/letters, and profile changes — each running
submit → status → decision → visible effect.

Seeded with 3 legal entities, 18 employees, 40 requests, 36 compensation records, 53
employment events and 17 documents. All demo data, no real people.

## Product decisions

**The legal entity carries policy, not just a name.** `LegalEntity` owns the working week,
holiday calendar, currency, probation length and notice period. The same eight-day leave
request costs **3 days for a UAE employee** (Mon–Fri, three national holidays in range) and
**6 for a Saudi one** (Sun–Thu, none). There is no country-specific branch anywhere in the
request code — adding a fourth country is inserting a row.

**`User` and `Employee` are separate tables.** Not every employee needs a login, an HR admin
need not be an employee, and an offboarded person keeps their record while losing access.

**Compensation lives in its own dated table.** Salary is the most sensitive field in the
system; keeping it off the employee row means the default serializer physically cannot leak
it, and salary history comes free.

**Leave days are held at submission, not deducted at approval.** The naive version lets
someone submit the same twenty days three times while the first sits in a queue.

**Profile changes are approval-gated rather than self-edited.** Once the record feeds
payroll and visa paperwork, a silent self-edit is a data-integrity problem. The allowlist
keeps job title, salary and legal entity permanently out of reach of self-service.

**Three workflows, not two.** They share one approval engine, so the third cost a schema
table.

## Research influences

- **BambooHR** — the employee record as the product: one profile consolidating everything,
  with employment history as a timeline of dated events rather than fields that silently
  overwrite. Drove `EmploymentEvent` and the merged timeline endpoint.
- **Deel / Rippling** — country is policy, not a display label. The single largest influence
  on the data model, and the reason `LegalEntity` owns the working week, holidays, currency
  and notice period, and why HR can be scoped to one entity.
- **Personio / Zoho People** — the value of self-service is the request lifecycle, not the
  form. Drove the `Request` supertype, one unified inbox, human-readable references
  (`LV-2026-0031`), and status visible at every point.

**Deliberately not copied:** several of these let employees edit contact details directly.
Approval-gated changes were chosen instead, for the reason above.

## MVP vs later

**In now:** multi-entity model with per-country policy · four roles with entity scoping ·
directory with search/filter/sort/pagination · employee create and edit · full profile ·
dated compensation behind a permission gate · employment timeline · three self-service
workflows end to end · unified approval inbox · leave policy, holidays, balances and shared
calendar · document records with expiry tracking · management dashboard, alerts and
currency-safe payroll · in-app notifications · immutable audit trail · optional AI letter
drafting with a deterministic fallback.

**Next, in priority order:** file upload to object storage (the model is already
storage-agnostic) · onboarding/offboarding checklists · a year-end leave carry-over job
(`carryOverMaxDays` is modelled but nothing applies it) · rendered PDF letters ·
multi-stage and delegated approval · an org chart (the data supports it).

**Explicitly not planned:** country-compliant payroll calculation, government or visa
integrations, biometric hardware, native mobile apps.

## Testing performed

| Suite | Result |
|---|---|
| Backend integration (Vitest + Supertest, real PostgreSQL) | **118 / 118 passing** |
| Frontend unit (adapters, HTTP client, formatters) | **34 / 34 passing** |
| E2E acceptance (Playwright, real stack, desktop + mobile) | **38 / 38 passing** |
| Typecheck, backend build, frontend production build | **clean** |
| Migrations + seed from an empty database | **verified** |

All three suites run in CI on every push.

Beyond the automated suites, a full acceptance audit was run against a live stack: 18
authorization and IDOR probes with real tokens (employee reaching for a colleague's salary,
documents, timeline and requests; entity-scoped HR reaching across entities; a manager
reaching for a report's salary; self-approval; privileged fields smuggled through the
profile-change endpoint; tampered and missing tokens; account enumeration) — every one
correctly refused. The UAE-vs-Saudi leave arithmetic was recounted independently against
each entity's own calendar. The AI letter path was exercised in both states: with a real API
key Gemini drafts the letter, and with the key removed the same approval produces the
deterministic template. Browser QA covered every admin and employee destination at 1440×900
and 390×844 with zero console errors and zero failed API requests.

That audit found and fixed three defects: leave types leaking across all legal entities into
the employee's request form, a hidden year in the directory's *Joined* column that made a
correct sort look broken, and a sidebar badge left stale after a request decision.

A second, independent acceptance pass against the deployed build raised twelve further
findings. Seven were confirmed and fixed — most seriously an edit form that silently
overwrote an employee's work mode on any unrelated save, and a Manager role that had no
workspace despite the backend already authorising one. Three were confirmed but deferred as
cosmetic, one was a Render free-tier cold start rather than a code defect, and one (a blank
work-email field) did not reproduce. Every finding, with its verdict and evidence, is in
[`docs/SPEC-COMPLIANCE.md`](docs/SPEC-COMPLIANCE.md).

## AI usage

The build was split between two coding assistants along a deliberate line — one owned the
server and the data, the other owned the client and the tests.

- **Claude Code (Claude Opus 5)** — **backend and integration**: the data model, the
  Express/Prisma API, the authorization layer, the request/approval engine, the AI letter
  service, and the integration layer binding the frontend to the API.
- **OpenAI Codex** — **frontend and testing**: the React application, its components and
  responsive design system, the automated test suites, and QA over the finished flows.

Splitting it this way meant the test suites were written by the assistant that did *not*
write the API — so they worked from documented behaviour rather than from their own
assumptions, and several defects were caught exactly there.
- **Google Gemini `gemini-2.5-flash`** — the one AI feature *inside* the product: drafting
  bilingual HR letters when a document request is approved. Roughly **$0.0022 per letter**;
  Flash with thinking disabled and temperature 0.2, because a legal letter should be
  predictable rather than creative. **$0.00 as delivered**, since no key is configured on
  the deployment and the deterministic templates are used.
- **V0** — not used. The interface was hand-built; AI was applied to the engineering, not to
  screen generation.

Everything generated was reviewed, and several defects were caught before shipping — the
full list, including the ones found by tests rather than by reading, is in
[`AI-USAGE-LOG.md`](AI-USAGE-LOG.md). Total spend is comfortably under the USD 200 ceiling.

## Known limitations

- Documents are metadata plus generated letter text; there is no binary upload or object
  storage yet, so seeded file URLs point at a `.demo` host that does not resolve.
- Letters are stored as searchable text rather than rendered PDFs.
- Public holidays are illustrative — Islamic dates move with lunar observation, and
  production would source them per country from an official calendar.
- The live Gemini call has no automated test. Both branches were verified by hand, but the
  suites force the key empty on purpose so they stay deterministic, offline and free.
- The headcount trend is computed in memory (fine at this scale, belongs in SQL past a few
  thousand employees), and rate limiting is in-process (fine for one instance).
- No component-level frontend unit tests; UI behaviour is covered by the Playwright suite
  instead.
