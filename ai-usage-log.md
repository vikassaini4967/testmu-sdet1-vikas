# ai-usage-log.md

Every AI tool I used on this assessment, the task it helped with, and what it
produced — including where it was wrong. Evidence is linked wherever a claim
can be checked.

## Summary

| AI tool | Model | Task it helped with | What it produced |
|---|---|---|---|
| **Groq API** — the LLM model inside the framework | `openai/gpt-oss-120b` (free tier), called over the API | **Task 2** — generating the test cases from my prompts (`npm run generate:cases`) | Gherkin + JSON for Login, Dashboard and API in two measured runs → [`test-cases/generated/`](test-cases/generated/) |
| | | **Task 3** — the failure explainer agent and the run-level classifier, live on every failing test | Diagnoses attached to the Playwright report, bucketed run reports, verified locator proposals → [`samples/`](samples/README.md) |
| **Claude Code** (VS Code extension) | Claude Opus 5.5 | **Tasks 1–3** — verifying the target, building the framework and AI layer, drafting and iterating the prompts, running everything, docs | Most of the code in `src/`, `tests/`, `scripts/`; prompts v2–v3; this documentation |
| **Claude** (claude.ai) | Claude | **Task 1** — the first scaffold | Initial folder layout and config, v1 prompts and v1 test cases ([`prompts/history/v1-claude-ai.md`](prompts/history/v1-claude-ai.md)), first doc drafts |

Not used: ChatGPT, Copilot, Cursor, Gemini (the framework *supports* Gemini,
Cerebras, OpenRouter, Anthropic and local models; Groq is the key I used).

I kept the **runtime model separate from the authoring tools on purpose**: the
framework has to run on a free model that any reviewer can reproduce with one
key, and a claude.ai subscription does not include API access.

---

## Task 1 — Setup and scaffold

**Claude (claude.ai)** produced the first scaffold: the `src/ai · api · pages ·
fixtures · reporters` layout that survived, a multi-project Playwright config
(API specs never launch a browser), and the auto-fixture idea for attaching
explanations to the report.

**Claude Code** then checked it against the live app before any test was
trusted — the API contract with `curl`, the UI with throwaway Playwright scripts
on throwaway accounts — and rebuilt what was wrong:

- selectors had been inferred, not observed (a `<select>` filter, a logout link, an `.alert` box, a category badge — none exist)
- `baseURL` had no trailing slash, so `page.goto('login')` left the app
- the demo script could never find its tests
- the LLM client only supported a paid API

The rebuilt framework creates and seeds its own accounts through the API per
test (no manual setup), blocks third-party ad hosts, and keeps known app
defects as `test.fail()`. **34 tests, all green against the live app.**

## Task 2 — Prompt engineering for test generation

**Claude Code** drafted v2 and v3 of the prompts from facts it had verified on
the live app; **`gpt-oss-120b` generated the test cases** from them over the
API; Claude Code then compared the raw output with the live app, and the
curated cases in [`test-cases/`](test-cases/) were built from both runs.

What the generating model got wrong, and what changed — details in [`prompts.md`](prompts.md):

- invented exact error messages and a test id that the facts didn't contain → v3 "facts only" rules took both to zero
- asserted a `/login` redirect that a stated fact rules out — in v2 **and** v3 (not fixed by prompting; curated by hand)
- copied a JSON placeholder literally into every module → placeholder rewritten
- best output: it proposed the forgot-password enumeration case, which **fails on the live API** — a real security defect (KNOWN-BUG-002)

## Task 3 — LLM integration (Option A, with B on top)

**Claude Code** built the integration: a provider-neutral client, the agent
loop with tools (including `probe_locator`, which checks a proposed locator on
the live page), cross-run history, the classifier and the reporter.
**`gpt-oss-120b`** is the model it calls.

I ran the AI demo four times and changed the prompts and code between runs
based on the real output ([`samples/README.md`](samples/README.md)):

| Run | What the model did wrong | Change |
|---|---|---|
| 1 | Diagnosed a renamed test id correctly, labelled it `real_bug` | Verdicts defined by where the defect is |
| 2 | Right answer, wrong output format → defaulted to `real_bug` | Self-correction turn |
| 3 | Filed a failed-then-passed test as `test_defect` (my run-1 fix over-corrected) | Retry evidence enforced in code |
| 4 | 7/7 in the right bucket | — |

---

## Where the AI tools were wrong — and how it was caught

- **The first scaffold described work that hadn't happened** — a sample labelled "real output, captured verbatim" that no run had produced, and notes about prompt sessions that hadn't taken place. All of it was replaced by real runs.
- **Claude Code's first demo specs leaked the answer** — explanatory comments sat next to the failing lines, inside the source window the agent reads.
- **Claude Code drafted a bug claim the evidence didn't support** (that the phone menu toggle starts off-screen). The assertion for it passed, so the claim was removed.
- **`test.fail()` hides why a test fails**, so each known-bug test was run with its error read, to confirm it fails for the documented reason and not a broken selector.
- **The runtime model suggested inverting an assertion** to make a test pass (expect 401 instead of logging in). That is why the framework only *proposes* fixes.

## Free-tier constraints that shaped the code

Groq's free tier allows 8,000 tokens per minute per request. The prompt runner
therefore compacts history and converts JSON per module when a request is too
large, and logs when it did (`run.json`). The client honours the provider's
retry hints on 429.

## What I'd still not hand to an AI unsupervised

- **Anything that depends on how the target actually behaves** — every model here wrote confident tests for behaviour that doesn't exist. Every kept case was run against the live app.
- **Applying fixes** — proposals are verified and shown; a human merges.
- **Deciding a failure is flaky** — retry evidence is enforced in code, because a prompt rule wasn't enough.
