# AI usage and cost log

Required by section 8 of the brief: the tools used, what they were used for, and the approximate spend.

**Budget ceiling:** USD 200 · **V0 used:** no

---

## Tools used

| Tool | Model | What it was used for |
|---|---|---|
| **Claude Code** | Claude Opus 5 | The bulk of the build: data model design, backend implementation, the test suites, the frontend API integration layer, browser-driven QA, and the documentation. |
| **Google Gemini API** *(inside the product)* | `gemini-2.5-flash` | The one AI feature shipped in the product itself: drafting bilingual HR letters when a document request is approved. |

No V0 was used. The frontend visual design was hand-built with Vite + React; AI was applied to the engineering, not to screen generation.

---

## How AI was actually used

Being specific, because "used AI" on its own says nothing:

**Where it did the heavy lifting**
- Translating the brief into a data model, then arguing the trade-offs (why compensation is a separate table, why `User` and `Employee` are split, why requests use a supertype instead of a JSON blob).
- Writing the 118 backend tests, including the permission-boundary cases that are tedious to enumerate by hand.
- The frontend adapter layer — mapping every API shape onto what the existing UI already rendered, without rewriting 850 lines of working JSX.
- Driving a real browser through the flows and catching regressions.

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

This cost is **$0.00 as delivered** — no API key is configured, so the deterministic templates are used. The feature is opt-in.

### Development AI

<!-- Fill in from your Anthropic Console usage page or subscription billing. -->
| Item | Spend |
|---|---|
| Claude Code (subscription or API usage over the build) | **$____** |
| Gemini API calls during development and testing | **$0.00** (no key configured; templates only) |
| V0 | $0.00 (not used) |
| **Total** | **$____** |

> Replace the blanks with your actual figure before submitting. If Claude Code ran on a Max/Pro subscription rather than metered API billing, state the subscription cost for the period instead — that is the honest number.

**Note on the provider switch:** the letter feature was first built against Claude Opus 5 and then moved to Gemini 2.5 Flash. Only the ~40-line model-call function changed — the templates, the privacy guard, the schema validation and the fallback logic are provider-agnostic and were untouched. That is the payoff of keeping the AI call behind one narrow interface.

**Against the $200 ceiling:** comfortably under. The brief notes cost efficiency is itself part of the assessment, and no paid image generation, no V0 credits, and no hosted inference were needed — the deployment target (Render + Neon) is free-tier throughout.
