# ai-usage-log.md

Every AI tool used on this assessment, what it was used for, what it produced,
and where it was wrong. Where a claim can be checked, the evidence is linked.

## Tools

| Tool | Model | Role | Used for |
|---|---|---|---|
| **Claude** (claude.ai chat) | Claude | Authoring, session 1 | First scaffold of the repo as a zip: folder layout, Playwright config, page objects, v1 test cases, v1 prompts, first drafts of the docs, a personal setup guide (not committed) |
| **Claude Code** (VS Code extension) | Claude Opus 5.5 (`claude-opus-5-5`) | Authoring, session 2 | Verifying the scaffold against the live app, rewriting most of it, the multi-provider LLM layer, the self-healing probe, the cross-run history, v2/v3 prompts, running everything, these docs |
| **Groq API** (free tier) | `openai/gpt-oss-120b` | Runtime | The LLM inside the framework (Task 3), and the model that ran the Task 2 prompts |

Not used: ChatGPT, Copilot, Cursor, Gemini. (The framework *supports* Gemini,
Cerebras, OpenRouter, Anthropic and local models — a key for Groq is what I had.)

Authoring and runtime are deliberately different models: the framework must
work on a free tier a reviewer can reproduce, and a claude.ai subscription does
not include API access.

---

## Session 1 — Claude (claude.ai): the first scaffold

**Produced:** the folder structure that survived (`src/ai · api · pages ·
fixtures · reporters`, `tests/`, `test-cases/`, `scripts/`), the idea of
attaching explanations through an auto-fixture, the agent-with-tools design,
24 v1 test cases and the v1 prompts (kept verbatim in
[`prompts/history/v1-claude-ai.md`](prompts/history/v1-claude-ai.md)).

**What was wrong with it** — none of it had been run against the target:

- Selectors were inferred, not observed: category filter as a `<select>`, logout as a link, errors in `.alert`, a `note-card-category` badge. None exist.
- Two cases expected redirects to `/login` that the app doesn't do.
- `baseURL` without a trailing slash made every `page.goto('/login')` resolve to the site root, outside the app.
- `npm run demo:failure` could never find the demo tests (they were excluded unless an env var the script didn't set was present).
- The code supported only Anthropic, while its own setup guide said Gemini — the AI layer could not run on a free key.
- The sample output, `prompts.md` and this log described runs and checks that had not happened (e.g. a sample labelled "real output, captured verbatim"). All of that was removed; every sample now comes from a real run.

## Session 2 — Claude Code: verify, rebuild, run

What Claude Code did, in order. Each step's output is in the repo.

1. **Probed the live target before touching tests** — API contract with `curl`,
   UI with throwaway Playwright scripts against real throwaway accounts. Found the
   selector and redirect mismatches above, and three real defects in the app:
   - KNOWN-BUG-001 — every page is 502px wide in a 412px phone viewport (layout wrapper `div#core` fixed at 500px)
   - KNOWN-BUG-002 — `/users/forgot-password` reveals whether an account exists
   - KNOWN-BUG-003 — malformed JSON gets a 400 without the API's own error envelope
2. **Rebuilt the framework on what was observed:** page objects on real test
   ids, accounts created and seeded through the API per test (no manual setup,
   no shared state), third-party ad hosts blocked, known bugs as `test.fail()`
   with issue annotations. 34 tests, all green against the live app.
3. **Replaced the single-vendor client** with a provider-neutral one (plain
   `fetch` for OpenAI-compatible APIs, SDK for Anthropic): Gemini, Groq,
   Cerebras, OpenRouter, Anthropic, local.
4. **Extended the agent:** `probe_locator` (checks a proposed locator against
   the live page; our code — not the model — decides "verified"), source-line
   context, a no-tools fallback, a self-correction turn, cross-run history
   (`runs.jsonl` + `failures.jsonl`), a fourth bucket (`test_defect`).
5. **Ran the AI demo four times on Groq** and changed the prompts/code between
   runs based on what came back — [`samples/README.md`](samples/README.md).
6. **Rewrote the Task 2 prompts (v2, v3), ran them on Groq**, measured what
   changed, and curated the automated cases from both runs plus the live app —
   [`prompts.md`](prompts.md), raw output in [`test-cases/generated/`](test-cases/generated/).

### Where the AI was wrong in session 2 too

- **Claude Code's first verdict rules** let the agent call a renamed test id a
  "real bug" (demo run 1). Its fix for that **over-corrected** — the classifier
  then filed a failed-then-passed test as `test_defect` (run 3). Final fix: hard
  evidence enforced in code, not prompt.
- **Claude Code's first demo specs leaked the answer** — explanatory comments
  sat next to the failing lines, inside the source window the agent reads.
- **A responsive-bug claim was drafted that the evidence didn't support** (that
  the menu toggle starts off-screen on a phone). The assertion for it passed, so
  the claim was removed and the bug note only states what was measured.
- **`test.fail()` hides *why* a test fails**, so each known-bug test was run and
  its error read to confirm it fails for the documented reason, not a broken selector.

### Where the runtime model (gpt-oss-120b) was wrong

- Invented exact error messages and a test id that the prompt's facts didn't contain (v2).
- Asserted a `/login` redirect that a stated fact rules out — in v2 **and** v3.
- Copied a placeholder from the JSON shape literally into every module.
- Returned a correct diagnosis in the wrong format (demo run 2).
- Suggested inverting an assertion to make a test pass (demo runs 1 and 3).

### Free-tier constraints that shaped the code

Groq's free tier caps one request at 8,000 tokens/minute. The Task 2 runner
therefore compacts conversation history and converts JSON per module when a
request is too large (and logs that it did — see each `run.json`). The client
honours the provider's retry hints on 429.

---

## What I would not hand to an AI unsupervised, based on this

- **Anything that depends on how the target actually behaves.** Both models
  produced confident tests for behaviour that doesn't exist. Every case here was
  run against the live app before it was kept.
- **Auto-applying fixes.** The model's first fix for a missing login was to
  change the assertion to expect the failure. The framework proposes and verifies
  locators; a human merges.
- **Deciding a failure is flaky.** Retry evidence is enforced in code because a
  prompt rule was not enough.
