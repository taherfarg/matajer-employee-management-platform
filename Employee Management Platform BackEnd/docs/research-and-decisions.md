# Research, product decisions and roadmap

Companion to the [README](../README.md). The README explains *what was built and how*; this document explains *why those choices and not others*, and what was deliberately left for later.

---

## 1. Research summary

The brief asks for a strong small-company MVP without handing over a feature list, so the first question was what a People Operations platform actually has to do before anyone will use it. Three product categories informed the design.

### BambooHR — the employee record as the product

The pattern worth taking: **one profile page that consolidates everything about a person**, with employment history rendered as a timeline rather than a set of fields that silently overwrite each other. A promotion is an event with a date, not a `job_title` column that changed at some unknown point.

What this drove here:
- `EmploymentEvent` as a first-class table, written automatically whenever a job title, reporting line, entity or status changes.
- `GET /employees/:id/timeline`, which merges employment events, decided requests and — for those permitted to see it — compensation changes into one ordered feed.
- Status changes modelled as an endpoint requiring a reason and an effective date, not as a field edit.

### Deel and Rippling — the multi-entity, multi-country reality

The pattern worth taking: **country is not a display label, it is policy**. These products exist because employing people in several countries means different working weeks, different holiday calendars, different leave entitlements, different notice periods and different currencies — and a platform that treats country as a text field gets all of them wrong.

This is the single largest influence on the data model, and it is why `LegalEntity` carries `workWeek`, `probationMonths`, `noticePeriodDays` and `currency`, and owns its own `LeaveType` and `Holiday` rows rather than inheriting a global default.

The observable result: the same 8-day leave request costs **3 days** in the UAE entity and **6 days** in the Saudi entity. That difference falls out of one `workWeek` column and the entity's holiday rows — no conditional logic anywhere in the request code.

It also drove `scopedLegalEntityId` on `User`. A group operating in three countries usually has HR staff who administer one of them, not all three. Supporting that in the MVP proves the entity boundary is enforced rather than decorative.

### Personio and Zoho People — self-service that removes work from HR

The pattern worth taking: **the value of self-service is the request lifecycle, not the form**. An employee needs to submit, see status, and see the decision without asking anyone. HR needs one queue, not three inboxes.

What this drove:
- A `Request` supertype so the admin gets one unified inbox with per-status counts, rather than a separate screen per workflow.
- Every request carries a human-readable reference (`LV-2026-0031`) because that is what people quote when they follow up.
- A status the employee can see at every point, with the decision note attached.
- Notifications fanned out to whoever can actually act — global admins, HR admins scoped to that entity, and the requester's direct manager.

### The pattern I deliberately did not copy

Several of these products let employees edit their own contact details directly. I chose approval-gated profile changes instead. The reasoning: as soon as the record is the source of truth for payroll, visa paperwork and emergency contact, a silent self-edit is a data integrity problem. Routing it through the same approval engine costs nothing extra — the engine already exists for leave — and produces an audit trail as a side effect.

---

## 2. Choosing the workflows

The brief explicitly warns against treating HR features as a checklist, so each of the three was chosen for a specific reason.

| Workflow | Why it earned a place |
|---|---|
| **Leave** | Highest-volume HR workflow in any company, and the only one that forces the legal-entity model to do real work. Without it, multi-country support would be an untested claim. |
| **Documents and letters** | Salary certificates, employment letters, NOCs and visa support letters are constant in GCC operations and genuinely tedious to chase by email. It also exercises the privacy boundary directly: should this letter state the salary? |
| **Profile changes** | Demonstrates *why* employees cannot self-edit, produces the audit story, and shows the allowlist keeping job title and salary permanently out of reach of self-service. |

Three rather than two because they share one approval engine. The marginal cost of the third was a schema table and a handful of validation rules; the benefit is a product that feels complete rather than demonstrative.

### Considered and rejected for this MVP

- **Attendance and timesheets** — a large domain of its own, and the brief rules out biometric devices.
- **Performance reviews and goals** — high value, but it is a second product, not a feature.
- **Expense claims** — the same approval engine would serve it, but it duplicates the leave workflow's lesson without adding a new one.
- **Recruitment and applicant tracking** — outside "employee management" as the brief frames it.

---

## 3. Decisions worth defending

Each of these was a real fork in the road.

**Backend-owned JWT rather than Supabase Auth with row-level security.**
RLS is a strong mechanism and would have been less code. It was rejected because it moves every authorization rule into SQL policies. For an assessment where the privacy design is being judged, having all rules in one readable file with tests pointed at it is worth more than the lines saved — and it keeps the project portable rather than tied to one vendor.

**Compensation in its own table rather than columns on `Employee`.**
The alternative was simpler to query. It was rejected because a salary column on the employee row is one careless `select *` away from a leak, and because dated history comes free with the separate table. This is defence by construction: the employee serializer *cannot* leak pay, because pay is not in the object it serializes.

**Re-reading the user from the database on every authenticated request.**
The alternative — trusting the JWT claims — saves a query per request. It was rejected because offboarding someone should log them out now, not up to fifteen minutes later. At this scale the query is an indexed primary-key lookup; the correctness is worth more than the microseconds.

**Days held as `pendingDays` at submission rather than deducted at approval.**
The naive version deducts on approval. That lets an employee submit the same twenty days three times while the first request sits in a queue, and the balance only discovers the problem after all three are approved. Holding at submission makes the balance honest at every moment.

**Nobody may approve their own request, including a global admin.**
An admin can already do almost anything, so this could look like a technicality. It is the rule that keeps the audit trail meaningful: every decision has a decider who is not the beneficiary.

**Unrelated requests return 404, not 403.**
A 403 confirms the reference exists. For a resource keyed by a guessable-looking reference, that is itself a leak.

**Payroll cost grouped by currency, never summed.**
A single total across AED, SAR and EGP requires an exchange rate. The platform does not have one, and inventing one would produce a number that looks authoritative and is wrong. The API returns per-currency figures and says so in the response.

---

## 4. Assumptions

Recorded rather than escalated, per the brief's instruction to decide and document.

1. **One approval stage is enough.** HR or the direct manager decides. Real companies often chain approvals; that needs configuration UI beyond a focused MVP.
2. **Leave balances are tracked per calendar year.** Requests spanning a year boundary are refused with a clear message rather than silently split, which would make the accounting wrong.
3. **Departments span legal entities.** Engineering is one function employing people in three countries.
4. **Managers do not see compensation.** Chosen deliberately; trivially reversible by changing one function in `access.ts` if the business disagrees.
5. **Employees can see a company directory.** Name, title, department and work email — how real HRIS products behave, and more useful than hiding colleagues. No personal data or pay.
6. **Public holidays are seeded as fixed demo dates.** Islamic holidays move with lunar observation; production would source them per country.
7. **Offboarding disables the login but preserves the record.** Employment history is a business record; access is not.

---

## 5. MVP versus later

### In the MVP

Multi-entity organisation with per-country policy · employee directory with search, filter, sort and pagination · full employee profile with three permission-scoped views · employee creation with optional login and pro-rated leave balances · dated compensation history behind its own permission gate · employment timeline · three self-service workflows end to end · unified approval inbox · leave policy, holidays, balances and shared calendar · document records with expiry tracking · management dashboard, alerts and currency-safe payroll overview · in-app notifications · immutable audit trail · four roles with entity scoping · 105 automated tests.

### Next phase

| Priority | Item | Note |
|---|---|---|
| High | File upload to object storage | Documents are metadata plus a URL today; the model is storage-agnostic. |
| High | Onboarding and offboarding checklists | Highest-value addition for a growing company. |
| High | Year-end leave carry-over job | `carryOverMaxDays` is modelled; no scheduled job applies it. |
| Medium | Generated PDF letters | Approval creates and links the record; rendering needs a template system. |
| Medium | Multi-stage and delegated approval | Needs configuration UI and state machinery. |
| Medium | Org chart endpoint | Data supports it — self-referencing `managerId` with cycle protection. |
| Medium | Email or Slack delivery | In-app notifications are complete; delivery is integration risk with no demo value. |
| Low | Attendance and timesheets | A domain of its own. |
| Low | Performance reviews | A second product. |
| Low | Full-text search | `ILIKE` across six columns is correct and fast at this scale. |

### Explicitly not planned

Country-compliant payroll calculation · government, labour authority or visa integrations · biometric hardware · native mobile applications · microservices. All are either ruled out by the brief or would be overengineering for the problem.
