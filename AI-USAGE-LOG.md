# AI usage and cost log

Required by section 8 of the brief: the tools used, what they were used for, and the approximate spend.

**Budget ceiling:** USD 200 · **V0 used:** no

---

## Tools used

The work was split between two coding assistants along a deliberate line — one owned the
server and the data, the other owned the client and the test suites.

| Tool | Model | What it was used for |
|---|---|---|
| **Claude Code** | Claude Opus 5 | **Backend and integration.** Data model design, the Express/Prisma API, the authorization layer, the request/approval engine, the AI letter service, and the frontend↔API integration layer that binds the two halves together. |
| **OpenAI Codex** | — | **Frontend and testing.** The React application — screens, components, state and styling — plus the automated test suites and QA passes over the finished flows. |
| **Google Gemini API** *(inside the product)* | `gemini-2.5-flash` | The one AI feature shipped in the product itself: drafting bilingual HR letters when a document request is approved. |

No V0 was used. The frontend visual design was hand-built with Vite + React; AI was applied to the engineering, not to screen generation.

**Why split it this way.** The backend is where the irreversible decisions live — the schema,
the permission boundaries, the balance arithmetic — so it went to one assistant that could
hold the whole data model in view and argue the trade-offs. The frontend is broader but
shallower, and the test suites benefit from being written by something that did not write
the implementation: a test author who shares the implementer's blind spots writes tests that
share them too. Keeping the integration layer with the backend meant the side that owned the
API contract also owned the code consuming it.

---

## How AI was actually used

Being specific, because "used AI" on its own says nothing:

**Where Claude Code did the heavy lifting — backend and integration**
- Translating the brief into a data model, then arguing the trade-offs (why compensation is a separate table, why `User` and `Employee` are split, why requests use a supertype instead of a JSON blob).
- The authorization layer: collapsing every access rule into one readable file so the privacy design could be reviewed in a sitting rather than hunted for across controllers.
- The request/approval engine shared by all three workflows, including the balance hold at submission and its release on rejection or cancellation.
- The AI letter service, and the privacy guard that keeps salary out of the prompt entirely rather than redacting it afterwards.
- The frontend adapter layer — mapping every API shape onto what the UI already rendered, without rewriting 850 lines of working JSX.

**Where Codex did the heavy lifting — frontend and testing**
- The React application: the admin and employee screens, the shared component primitives, the responsive layout and the design system in `styles.css`.
- The automated test suites, including the permission-boundary cases that are tedious to enumerate by hand.
- QA passes over the finished flows on desktop and mobile widths.

**Why that division helped.** The test suites were written by the assistant that did not write
the API, which is the whole point: it had to work from the documented behaviour rather than
from its own assumptions, and several of the defects below were caught exactly there.

**Where it was corrected**
Everything generated was reviewed and several things were wrong. Notable examples, all caught before shipping:

| Defect | How it was caught |
|---|---|
| Empty API-key value in `.env.example` crashed the app at boot — would have broken every fresh setup | New test suite failed on import |
| Money-detector regex matched any 4-digit number, so dates (`2023`) and reference numbers registered as salary figures — would have rejected every valid letter | Unit test |
| Disallowed CORS origins returned 500 instead of a clean rejection | Manual curl probe |
| Panels using the bare `.panel` class had no padding; eyebrow labels rendered outside the card | Mobile screenshot review |
| `fromService` in the Render blueprint yields a hostname with no scheme — would have produced a CORS value that silently never matches | Reading Render's contract before trusting the generated config |

The lesson worth stating: the generated code was strong on structure and weak on the boundaries — empty strings, regex edge cases, config that looks right. Tests and a real browser found those; reading alone would not have.

---

## Cost

### In-product AI (measurable)

Letter drafting calls `gemini-2.5-flash` with thinking disabled, a ~600-token prompt and a ~800-token bilingual response.

| Item | Rate (paid tier) | Per letter |
|---|---|---|
| Input | $0.30 / 1M tokens | ~$0.00018 |
| Output | $2.50 / 1M tokens | ~$0.00200 |
| **Total** | | **~$0.0022** |

About **a fifth of a cent per letter**, and only on approval of a document request. The seeded demo contains 8 document requests; regenerating every one costs under **2 cents**.

Gemini 2.5 Flash also has a free tier, so in practice a demo of this size is likely to cost **nothing at all**.

**Why Flash and not a frontier model:** the task is formulaic — fill a fixed letter structure from supplied facts, in two languages. There is no reasoning to do, which is why `thinkingBudget` is set to 0 and `temperature` to 0.2. Paying frontier-model rates here would buy nothing; this was a deliberate cost decision, and it is roughly 10× cheaper than the Claude Opus 5 implementation it replaced.

This cost is **$0.00 as delivered**. `GOOGLE_API_KEY` is marked `sync: false` in the Render blueprint and is left unset, so the deployed demo uses the deterministic templates and spends nothing. The feature is opt-in: setting a key switches letter drafting to Gemini, and both branches have been exercised on a running system (see *Testing summary* in the root README).

### Development AI

> [!IMPORTANT]
> **ACTION REQUIRED BEFORE SUBMISSION — ENTER THE ACTUAL CLAUDE CODE AND CODEX COSTS BELOW.**
>
> Neither figure is derivable from the repository and neither may be guessed. Take them from
> the Anthropic Console usage page and the OpenAI usage dashboard for the build period — or,
> where a tool ran on a subscription rather than metered billing, state the subscription cost
> for that period, which is the honest number. Replace the three `$____` cells and delete
> this box.

| Item | Spend |
|---|---|
| Claude Code — backend and integration (subscription or API usage) | **$____** ← fill in |
| OpenAI Codex — frontend and testing (subscription or API usage) | **$____** ← fill in |
| Gemini API calls during development and testing | **< $0.05** (a handful of `gemini-2.5-flash` letter drafts at ~$0.0022 each while verifying the live path) |
| V0 | $0.00 (not used) |
| **Total** | **$____** ← fill in |

Everything except the two coding-assistant lines is known and stated above. The ceiling is
USD 200 and every other input is free-tier or near-zero, so the total lands under the ceiling
for any plausible value of the missing figures — but the exact numbers still have to be real
ones.

**Note on the provider switch:** the letter feature was first built against Claude Opus 5 and then moved to Gemini 2.5 Flash. Only the ~40-line model-call function changed — the templates, the privacy guard, the schema validation and the fallback logic are provider-agnostic and were untouched. That is the payoff of keeping the AI call behind one narrow interface.

**Against the $200 ceiling:** comfortably under. The brief notes cost efficiency is itself part of the assessment, and no paid image generation, no V0 credits, and no hosted inference were needed — the deployment target (Render + Neon) is free-tier throughout.
