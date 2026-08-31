# Employee Management Platform — product summary

What was built, and the decisions behind it.

**Stack:** React + Vite (frontend) · Express + TypeScript + Prisma (API) · PostgreSQL · JWT auth
**Scale:** ~16,500 lines · 152 automated tests (118 backend · 34 frontend) plus a 38-case Playwright acceptance suite · 3 legal entities · 18 demo employees · 40 demo requests

---

## The idea in one paragraph

A company operating through separate legal entities in several countries needs one place to answer *who works here, under which entity, on what terms* — and every employee needs to answer *what am I owed and what happened to my request* without emailing HR. This platform does both, with the legal entity as the organising principle rather than a label.

---

## The decision that shapes everything

**The legal entity carries policy, not just a name.**

Most systems treat country as a display field. Here `LegalEntity` owns the working week, the public holiday calendar, the currency, the probation length and the notice period. Everything downstream reads from it.

The payoff is concrete and visible in the product: the same eight-day leave request costs

- **3 days** for a UAE employee — Monday–Friday week, three national holidays in range
- **6 days** for a Saudi employee — Sunday–Thursday week, no holidays in range

That difference falls out of one `workWeek` column and the entity's holiday rows. There is no country-specific branch anywhere in the request code. Adding a fourth country is inserting a row.

The employee sees this too: before submitting leave they get a live preview showing the chargeable days and naming the holidays that were skipped.

---

## Four more decisions worth defending

**`User` and `Employee` are separate tables.** Not every employee needs a login; an HR admin need not be an employee; an offboarded person keeps their employment record while losing their access. It also lets a login email differ from a work email, which is how the demo accounts work.

**Compensation lives in its own table.** Salary is the most sensitive field in the system. Keeping it out of the employee row means the default serializer *physically cannot* leak it — a column added later cannot accidentally expose pay. Dated salary history comes free, and each change closes the previous record the day before the new one starts, so the table answers "what were they paid on this date" and history cannot be rewritten.

**Requests are one supertype plus typed detail tables.** The admin gets a single unified inbox across all three workflows; leave still keeps real date columns for calendars and balance arithmetic rather than a JSON blob nobody can query.

**Leave days are held at submission, not deducted at approval.** The naive version lets an employee submit the same twenty days three times while the first sits in a queue. Holding them as `pendingDays` keeps the balance honest at every moment.

---

## The three self-service workflows

Chosen after looking at how BambooHR, Deel/Rippling and Personio structure employee self-service. The brief asks for two; these three share one approval engine, so the marginal cost of the third was a schema table.

| Workflow | Why it earned a place |
|---|---|
| **Leave** | Highest-volume HR workflow, and the only one that forces the legal-entity model to do real work. Without it, multi-country support would be an untested claim. |
| **Documents & letters** | Salary certificates, employment letters, NOCs, visa letters — constant in GCC operations and genuinely tedious to chase. Also exercises the privacy boundary: should this letter state the salary? |
| **Profile changes** | Demonstrates *why* employees cannot self-edit. The allowlist keeps job title, salary and legal entity permanently out of reach of self-service, and approval produces an audit trail. |

Each runs end to end: submit → see status → see the decision → see the effect.

---

## Privacy, which is the part I'd want reviewed

Four roles — `ADMIN`, `HR_ADMIN` (scopable to one entity), `MANAGER`, `EMPLOYEE`. Every authorization decision is made by a function in one file, `services/access.ts`, so the rules can be read in a sitting and tested directly.

Three calls that were deliberate rather than accidental:

**A line manager cannot see their report's salary.** They get the working context they need to plan around their team; pay conversations belong to HR. Asserted in the test suite so it cannot regress quietly.

**Employees get a directory, not a wall.** Any authenticated user can look up a colleague's name, title, department and work email — the same information a company address book shows. Personal identity data and pay are absent from the response entirely, not merely null, because the serializer names fields explicitly and never spreads the database row.

**Reading someone else's salary is itself audited.** Who *looked* is as important as who changed it. Reading your own is not logged. There is no update or delete endpoint for the audit trail anywhere in the API.

Two further rules: nobody approves their own request, including a global admin; and an unrelated request returns 404 rather than 403, because confirming a reference exists is itself a leak.

---

## The AI feature

Not required by the brief — the brief's AI budget is for *building* the product. This was added because it closes a real gap: before it, approving a document request created a record with no letter in it.

On approval, **Google Gemini** (`gemini-2.5-flash`) drafts the letter in **English and Arabic** from the employee's actual record. Three rules govern it:

1. **The template is the floor, the model is the ceiling.** Every letter type has a deterministic template that always produces a valid, signable letter. With no API key configured the feature degrades to templates and the product keeps working — which is why the demo needs no credentials to be evaluated.
2. **The model never sees data the letter may not contain.** Salary is passed only when the employee asked for it to be stated. Nothing is redacted afterwards, because the sensitive value was never in the prompt.
3. **Facts come from the database, never the model.** The prompt carries the employment record as structured values and forbids invention; output is schema-constrained. A second check rejects any draft that introduces a monetary figure when none was authorised, and falls back to the template.

Letters are stored as text, not a rendered file, so they stay searchable and auditable and can be re-rendered to PDF later. HR always sees whether a draft was machine-written before signing it.

Flash rather than a frontier model on purpose: the task is formulaic, so thinking is disabled (`thinkingBudget: 0`) and temperature held at 0.2 — a legal letter should be predictable, not creative.

Cost: about **a fifth of a cent per letter** ($0.30/1M in, $2.50/1M out), and $0.00 as delivered since no key is configured. Gemini's free tier likely covers a demo of this size outright.

---

## What management actually gets

Headcount by status, entity, department and type; hires and exits; average tenure; a 12-month headcount trend; pending requests by type; and share of workforce away today.

An alerts surface answers the "what will bite me next month" question: probation periods ending within 30 days, contracts ending within 90 (chosen over 60 because two entities carry 60-day notice periods), visas and permits expiring within 90 days, requests pending more than five days, plus anniversaries and birthdays.

Payroll cost is reported **grouped by currency and never summed across them**. A single total across AED, SAR and EGP would need an exchange rate the platform does not have, and inventing one would produce a number that looks authoritative and is wrong.

---

## What I would build next

| Priority | Item | Why it was left out |
|---|---|---|
| High | File upload to object storage | Documents are metadata plus a URL today; the model is storage-agnostic, so it is a one-field change. |
| High | Onboarding/offboarding checklists | Highest-value addition for a growing company; needs a task model. |
| High | Year-end leave carry-over job | `carryOverMaxDays` is modelled but no scheduled job applies it. |
| Medium | Rendered PDF letters | The text is generated and stored; turning it into a branded PDF needs a template system. |
| Medium | Multi-stage and delegated approval | Real in larger companies; needs configuration UI beyond a focused MVP. |
| Medium | Org chart view | The data supports it — self-referencing `managerId` with cycle protection. |
| Low | Attendance, performance reviews | Each is a domain of its own. |

**Explicitly not planned:** country-compliant payroll calculation, government or visa integrations, biometric hardware, native mobile apps. All are either ruled out by the brief or would be overengineering.

---

## Honest limitations

- **Documents are metadata plus a URL.** No binary upload or object storage; seeded file URLs point at a `.demo` host that does not resolve.
- **The AI letter path is verified, but only manually.** Both branches have been exercised against a running system: with a real `GOOGLE_API_KEY` configured, Gemini drafts the letter and the record is flagged `isAiGenerated: true`; with the key removed, the same approval produces the deterministic template and is flagged `false`. Neither the automated suites nor CI make a live model call — they force the key empty on purpose, so the model round trip is not covered by a regression test and would not catch an SDK or API change.
- **Public holidays are illustrative.** Islamic holidays move with lunar observation; production would source them per country from an official calendar.
- **The headcount trend is computed in memory.** Fine at this scale; past a few thousand employees it should move into SQL.
- **Rate limiting is in-process.** Fine for one instance; multi-instance would need Redis.
- **Frontend coverage is logic-level, not component-level.** The 34 frontend tests cover the adapters, the HTTP client and the formatters. There are no component unit tests; UI behaviour is covered instead by the 38-case Playwright acceptance suite in [`e2e/`](e2e/), which drives the real app against the real API and database at both 1440×900 and 390×844.
