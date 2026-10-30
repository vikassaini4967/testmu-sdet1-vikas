# testmu-sdet1-vikas

[![Regression + AI triage](https://github.com/vikassaini4967/Testmu-sdet1-vikas/actions/workflows/ci.yml/badge.svg)](https://github.com/vikassaini4967/Testmu-sdet1-vikas/actions/workflows/ci.yml)

AI-native regression framework for the TestMu AI SDET-1 assessment —
**Playwright + TypeScript**, with an LLM agent wired into the test lifecycle:
when a test fails, it investigates with tools, verifies its own locator fix
against the live page, and attaches a diagnosis to the Playwright report. A
run-level classifier then buckets every failure using history from previous runs.

> **The ticket:** *"We're spending too much time writing and fixing regression
> tests. Figure out where AI can actually help."*
>
> **Where the time goes:** not writing tests — fixing them. The 10–20 minutes
> between "CI is red" and "oh, the test id was renamed", on every red build.
> That is what this attacks — and it does it on a **free-tier** model.

**Stack:** Playwright · TypeScript · zod · **LLM: Groq `openai/gpt-oss-120b`**,
called over the API — it generates the test cases from the prompts (Task 2)
and diagnoses failing tests inside the run (Task 3). Swappable for Gemini,
Cerebras, OpenRouter, Anthropic or a local model with one env var.

| Brief | Where |
|---|---|
| Task 1 — scaffold | `src/` · `tests/` · CI — [layout](#layout) |
| Task 2 — prompts + generated cases | [`prompts.md`](prompts.md) · [`test-cases/`](test-cases/) · raw model output in [`test-cases/generated/`](test-cases/generated/) |
| Task 3 — LLM in the framework | [`src/ai/`](src/ai/) — Option A + B, [why A](src/ai/failure-explainer.ts) |
| Sample output from real runs | [`samples/`](samples/README.md) |
| AI usage | [`ai-usage-log.md`](ai-usage-log.md) |

---

## Results, against the live target

**System under test:** [ExpandTesting Notes](https://practice.expandtesting.com/notes/app) — one app with all three modules: login, a notes dashboard with filters/search, and a REST API with auth and CRUD.

- **34 tests / 32 test cases, all green** — every selector and contract verified against the live app, not inferred.
- **3 real defects found** — kept as `test.fail()` tests that flip red the day they're fixed:

  | | Defect | Found by |
  |---|---|---|
  | KNOWN-BUG-001 | Every page is 502px wide in a 412px phone viewport | TC-DASH-010 (responsive case from the prompts) |
  | KNOWN-BUG-002 | `forgot-password` says *"No account found…"* → account enumeration, while login is correctly generic | an **LLM-generated** security case (v2, TC-API-011) |
  | KNOWN-BUG-003 | Malformed JSON → 400 without the error envelope's `status`, raw parser message leaked | TC-API-013 (schema validation) |

- **AI triage demo: 7/7 failures in the right bucket** on `gpt-oss-120b`, after three rounds of fixes driven by real output — [samples/](samples/README.md).

![AI explanation inside the Playwright report](samples/html-report-ai-explanation.png)

---

## Quick start

```bash
git clone https://github.com/vikassaini4967/Testmu-sdet1-vikas.git
cd Testmu-sdet1-vikas
npm install
npx playwright install chromium

cp .env.example .env     # paste a free Groq key into GROQ_API_KEY (model is preset)

npm run verify:target    # is the app up, does the API contract still match?
npm run verify:llm       # does the key work — and does the model call tools?
npm test                 # 34 tests; accounts are created and deleted per test
npm run report           # Playwright HTML report
```

No test account to register, no data to seed — tests create their own through
the API. Without a key the suite still runs; failures get a "triage skipped"
note instead of a diagnosis.

**See the AI layer work** — the demo specs fail on purpose, one per bucket:

```bash
npm run demo             # then: ai-reports/ai-report.md, or npm run report → a failing test → Attachments
npm run demo             # run it again: the History column now shows the previous run
```

**Run the Task 2 prompts yourself:** `npm run generate:cases` sends the prompts
to the LLM as one conversation and saves the raw output to
`test-cases/generated/<run>/` — see [prompts.md](prompts.md).

---

## Task 3 — the LLM integration

### Option A (Failure Explainer), with B riding on top

**Why A:** B produces a *label*; a human still opens the trace to find out why.
A attacks the diagnosis — the expensive half. It also fails safer: a wrong
explanation costs a bad paragraph; a classifier that files a real bug as
"flaky" gets it ignored. Full reasoning: the comment block at the top of
[`failure-explainer.ts`](src/ai/failure-explainer.ts).

B is still worth having, so the run-level reporter classifies every failure —
using the per-failure diagnoses **and** cross-run history.

### How a failure flows

```
test fails
   │  auto-fixture (src/fixtures) — page still open, testInfo still live
   ▼
context: error · failing source line · URL · DOM · interactive elements · console · network · last API exchange
   │
   ▼
agent loop (src/ai/failure-explainer.ts) — thin summary + tools, pulls only what it needs
   ├─ get_selector_candidates   "what elements exist?"
   ├─ probe_locator             runs a candidate locator on the LIVE page → count, visible, HTML
   ├─ get_dom_snapshot / get_browser_logs / get_response_body
   └─ get_failure_history       how this test did in previous runs
   ▼
verdict · root cause · fix · proposed locator (verified by OUR code from the probe log)
   ├─► attached to the test in the Playwright HTML report
   └─► .ai-history/failures.jsonl
                     │
run ends ─► reporter (src/reporters/ai-reporter.ts)
   ├─ classifier (src/ai/flaky-classifier.ts): whole run + history → buckets, shared cause
   ├─ ai-reports/ai-report.md + .json  → CI job summary
   └─ .ai-history/runs.jsonl  ← next run learns from this
```

### What makes it more than a prompt

- **Agentic, and cheaper for it.** Most failures resolve in 1–4 steps; the
  model fetches evidence only when the error and source line aren't enough.
- **Self-healing — proposed, verified, never auto-applied.** The agent must
  check a replacement locator with `probe_locator` before proposing it, and
  *our code* marks it verified only if the probe log shows exactly one visible
  match. A suite that silently repairs itself stops telling you the app changed.
- **Learns over runs.** Every test's outcome and verdict per run goes into
  `.ai-history/` (cached between CI runs). "Failed 3 of 10 runs with 3 different
  errors" reads as flaky; "the same error 5 runs in a row" as an unfixed bug.
- **Four buckets, not three.** Option B's real bug / environment / flaky misses
  the commonest red build: *the app is fine and the test is outdated*. That's
  `test_defect`. Forcing it into "real bug" sends someone hunting a defect that
  doesn't exist.
- **Hard evidence beats model judgement.** Failed-then-passed is always flaky —
  enforced in code after the model got it wrong once ([run 3](samples/README.md)).
- **Production rails:** a per-run call budget shared across workers (atomic
  slot files), retries honouring the provider's retry hints, triage only on the
  final attempt, a self-correction turn when the output block is malformed,
  a no-tools fallback (`AI_DISABLE_TOOLS=1`), token cost in every report, and
  no LLM failure can change a test result.
- **Any provider.** Gemini, Groq, Cerebras, OpenRouter, Anthropic or a local
  model — one env var ([`providers.ts`](src/ai/llm/providers.ts)).

---

## Task 2 — prompts

Five prompts sent to the LLM as one conversation — context primed once with
facts verified on the live app, then Login, Dashboard, API, and a JSON
conversion — all in the same six-block shape (TASK · ROLE · REQUIRED COVERAGE ·
CONSTRAINTS · OUTPUT CONTRACT · SELF-CHECK). Three versions, two measured runs
on `gpt-oss-120b`, per-module notes on what didn't work: **[prompts.md](prompts.md)**.

The automated suite is **curated**, not pasted: generated cases were kept,
merged or corrected against the live app, and `npm run check:trace` keeps the
`.feature` files, `test-cases.json` and the spec titles in lockstep.

---

## Layout

```
src/
  ai/
    failure-explainer.ts   the agent loop + why Option A — start here
    flaky-classifier.ts    run-level buckets (the Option B half)
    history-store.ts       cross-run history — the "learns over runs" part
    context-collector.ts   DOM / elements / console / network / source line, probe_locator
    attach.ts              puts the diagnosis into the Playwright report
    budget.ts              per-run call cap shared across workers
    llm/                   provider-neutral client: providers · openai-compatible · anthropic
  api/        notes.client.ts (records every exchange for triage) · schemas.ts (zod contracts)
  pages/      login · dashboard · public pages (landing, forgot password, note)
  data/       accounts.ts — users + seeded notes via the API, deleted after each test
  fixtures/   ui-fixture.ts · api-fixture.ts — auto triage, specs import nothing extra
  reporters/  ai-reporter.ts
  utils/      network.ts — third-party ad/analytics blocking
tests/        login/ · dashboard/ · api/ · demo/ (fails on purpose, only with `npm run demo`)
test-cases/   *.feature · test-cases.json · generated/ (raw LLM output per run)
prompts/      test-generation/ (current) · history/ (v1, v2)
scripts/      verify-target · verify-llm · run-demo · generate-test-cases · check-traceability
samples/      real demo runs 1–4 + report screenshot
```

## Configuration

All optional except one LLM key — see [`.env.example`](.env.example).

| Variable | Default | |
|---|---|---|
| `GROQ_API_KEY` | — | The one required value |
| `AI_PROVIDER`, `AI_MODEL` | `groq`, `openai/gpt-oss-120b` | Preset in `.env.example`; other providers listed there |
| `AI_EXPLAIN` | on when a key is set | `0` = run with zero LLM calls |
| `AI_MAX_CALLS_PER_RUN` | 10 | Failures triaged per run (CI: 6) |
| `AI_MAX_AGENT_STEPS` | 5 | Tool round-trips per failure |
| `AI_DISABLE_TOOLS` | off | Single-prompt fallback for weak function calling |

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml): typecheck → traceability
check → target pre-flight → suite, with `.ai-history/` cached across runs and the
AI report posted to the job summary. Add `GROQ_API_KEY` (or `GEMINI_API_KEY`) as
a repository secret to enable triage; without it the suite runs, triage is skipped.

## If the target has changed

`practice.expandtesting.com` is public and can move. `npm run verify:target`
checks the UI, the health endpoint, and register → login → token → notes →
logout-revokes in under ten seconds. Fix `src/api/` before reading twenty red tests.

---

## What I'd build next

In the order I'd do it.

1. **Close the loop on verified heals — as a PR, not at runtime.** A verified
   locator proposal already exists; turn it into a draft PR with the one-line
   diff and the probe evidence. Selector repairs only: auto-editing assertions
   means auto-silencing bugs (the model's first instinct for a missing login was
   to expect the 401).
2. **Prompt regression tests.** The demo failures are a labelled set — run them
   in CI against the configured model and fail if bucketing drops below 7/7, so a
   model or prompt change that degrades triage is caught, not discovered.
3. **Tie failures to commits.** `git log` between last green and this red run as
   another tool: "started failing in `a3f91c2`, which touched the login form".
4. **Cluster by error shape across builds,** not just per test — "these 14
   failures over 3 days are one unfixed defect".
5. **Fix the two prompt failures I couldn't** (see [prompts.md](prompts.md)): the
   model overriding a stated fact, and losing the format exemplar when history is
   compacted for a free tier.

## Honest limitations

- **The demo's 7/7 is one model on seven failures** — a smoke test of the
  pipeline, not a benchmark. Run-to-run wording varies.
- **The free tier shapes behaviour:** Groq caps a request at 8k tokens/minute,
  so the prompt runner compacts history and converts JSON per module (and logs
  when it does).
- **The target has no lockout or rate limiting.** TC-LOGIN-007 and TC-API-010
  pass under either behaviour and *record* what they saw rather than assert a
  textbook 429.

---

Built by **Vikas Kumar Saini** · AI tooling logged in [`ai-usage-log.md`](ai-usage-log.md)
