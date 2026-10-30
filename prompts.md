# prompts.md

Every prompt used to generate the Task 2 test cases, verbatim, in the order
they evolved — plus what each version got wrong and what changed.

| | |
|---|---|
| **Run them yourself** | `npm run generate:cases` (any key from `.env.example`) — or paste `system.md` as the system/custom instructions and `00`→`04` into **one** chat conversation |
| **Prompt files** | [`prompts/test-generation/`](prompts/test-generation/) — the copies below are checked verbatim by `npm run check:trace` |
| **Raw model output** | [`test-cases/generated/`](test-cases/generated/) — never edited; each run folder holds `prompts-used/` and `run.json` |
| **Curated, automated cases** | [`test-cases/*.feature`](test-cases/) + [`test-cases.json`](test-cases/test-cases.json) |
| **Who wrote what** | v1 drafted in claude.ai; v2/v3 drafted with Claude Code; all runs below on Groq `openai/gpt-oss-120b` — see [`ai-usage-log.md`](ai-usage-log.md) |

---

## The shape every prompt follows

The same six blocks, in the same order, in every module prompt — so a
reviewer (or a teammate reusing them) can diff one module against another.

| Block | Why it is there |
|---|---|
| **TASK** | One line. What module, what output. |
| **ROLE** | Sets the stakes: *"a case that can pass for the wrong reason is worse than no case"*. This one sentence moves output from "covers the list" to "can actually fail". |
| **REQUIRED COVERAGE** | The brief's list, numbered, "every item, explicitly" — models silently drop items from unnumbered prose. |
| **CONSTRAINTS** | The anti-patterns, stated as rules. The highest-leverage block: say what you *don't* want, or you get it. |
| **OUTPUT CONTRACT** | Exact format, ID scheme, tag vocabulary, scenario count range — so output drops into the repo without reformatting. |
| **SELF-CHECK** | *"Could this pass while the feature is broken?"* — a cheap second pass the model runs on itself. |

Context is primed **once** (`00-context.md`) with facts verified against the
live app, and the module prompts say *"same system, same role, same output
contract"*. Re-pasting context per module causes drift between modules.

---

## How the prompts evolved

| Version | Written in | What changed | Evidence |
|---|---|---|---|
| **v1** | claude.ai (scaffold session) | First draft: role + facts + anti-patterns + output contract | [`prompts/history/v1-claude-ai.md`](prompts/history/v1-claude-ai.md); its 24 cases were checked against the live app: 4 relied on behaviour the app doesn't have (select filter, category badge, two `/login` redirects), and the page objects behind them had 4 more wrong guesses — listed per module below |
| **v2** | Claude Code | Facts re-written from the **live** app (real test ids, real routes, logged-out behaviour, token revocation); TASK/ROLE/…/SELF-CHECK shape; `@assumption` tag; brute-force and rate-limit cases required to be honest under either behaviour | [`run-1_v2-prompts_groq/`](test-cases/generated/run-1_v2-prompts_groq/) |
| **v3** | Claude Code | `system.md` gained 4 global rules (facts override priors; exact messages only from facts; only listed test ids; unique test data). `04-to-json.md` placeholder fixed. Module prompts 00–03 **unchanged**, so the comparison isolates these edits | [`run-2_…`](test-cases/generated/run-2_v3-prompts_groq/) (partial), [`run-3_v3-prompts_groq/`](test-cases/generated/run-3_v3-prompts_groq/) |

### Measured: v2 → v3 on the same model

Counted over the raw Gherkin of each run (01–03):

| Pattern | v2 (run 1) | v3 (run 3) |
|---|---:|---:|
| Scenarios | 29 | 31 |
| Hard-coded emails (`x@test.com` — collide with 409 on rerun) | 36 | **0** |
| Invented exact error messages (`"Invalid or revoked token"`, `"duplicate"`, `"ObjectId"`) | 6 | **0** |
| Invented test id (`note-card-category`) | 1 | **0** |
| `@assumption` tags | 1 | 3 |
| Asserts logged-out visitor is redirected to `/login` — **contradicting a stated fact** | yes | **still yes** |
| Proposes the forgot-password enumeration case (finds KNOWN-BUG-002) | yes (TC-API-011) | **no — lost** |

The rules fixed exactly what they targeted. They did **not** fix the model
overriding an explicit fact with its prior, and v3 lost the single most
valuable case v2 found. Better prompts are not monotonically better output —
which is why the curated suite below is built from *both* runs plus the live
app, not from whichever run looked tidier.

---

## What didn't work first time — per module

### Login
- **v1's session-expiry case cleared cookies/storage and expected a redirect to `/login`.** On the live app that shows the public landing page instead. Rewritten to revoke the browser's token server-side (`DELETE /users/logout`) — deterministic, under 5s, and the real expiry path. The v2 model independently proposed the same approach once the facts mentioned token revocation.
- **v2 invented exact messages** (`"Invalid or revoked token"` — the real one is *"Access token is not valid or has expired…"*) and asserted on them without an `@assumption` tag. v3's "exact messages only from facts" rule took this to zero.
- **v2 ignored "one case per failure mode"**: separate wrong-password and unknown-email cases *plus* an enumeration case covering both. Curated into one enumeration case (TC-LOGIN-003).
- **v2's brute-force case contradicted itself** — the comment said "may lock out or throttle", the assertion said "every attempt is 401". Curated TC-LOGIN-007 accepts 401 or 429, fails on 5xx, and records which it saw.
- **Neither version found the forgot-password enumeration from the Login prompt** — v2 found it from the API prompt. Kept as TC-LOGIN-009, which fails against the live app (KNOWN-BUG-002).

### Dashboard
- **v1 assumed a `<select>` category filter and a `note-card-category` badge.** Neither exists (four buttons; cards show no category text). Even with the real test ids listed in v2's facts, v2 invented `note-card-category` again; v3's "only listed test ids" rule stopped it.
- **All three versions assert that a logged-out visitor is redirected to `/login`** — in v2 and v3 directly contradicting a fact in the prompt ("It does NOT redirect to /login"). v3's "facts override your expectations" rule did not fix it. Curated TC-DASH-007 asserts the real behaviour. Next thing I'd try: restate contradicting facts as explicit `DO NOT assert …` lines inside the module prompt, where the attention is.
- **Sort was a wrong `@assumption`** in v2 and v3 ("newest first by creation; completing a note doesn't move it"). The tag did its job — it made the guess visible and took two minutes to check live: completed notes sink, ordering is by `updated_at`. Curated TC-DASH-005 tests that as behaviour.
- **v2's cross-user case checked user B's list, not a direct URL** to user A's note, despite "test direct URLs". Curated TC-DASH-008 opens `/notes/app/notes/<A's id>` as B.
- **v2's 320px responsive case was right** — and it fails on the live app (KNOWN-BUG-001). Kept as TC-DASH-010 with `test.fail()`.

### REST API
- **v2's TC-API-011 — "forgot-password with an unknown email returns 200, no enumeration" — fails against the live API**, which answers `401 "No account found with the given email address"`. An LLM-proposed security case catching a real defect; the best output of the exercise.
- **v2 asserted on invented message substrings in 6 places** (`"duplicate"`, `"ObjectId"`, `"Invalid or revoked token"`), several of which would fail on wording alone while the behaviour is correct. v3: zero.
- **v3 produced invalid Gherkin** (`Scenario TC-API-001:` instead of `Scenario: TC-API-001`). Cause: Groq's free tier caps a request at 8k tokens, so the runner elided earlier module outputs for this step — and with them the format example the model had been copying. Format examples matter as much as rules.
- **Kept from the generated cases:** one CRUD lifecycle ending in a 404 re-read, ObjectId / ISO-8601 / enum format checks, IDOR on read *and* write, and a rate-limit case that passes under either behaviour.
- **Added by curation:** malformed-JSON error envelope (TC-API-013), which found KNOWN-BUG-003 — no prompt version produced it.

### JSON conversion
- **v2's SHAPE line `"name": "Login | Dashboard | REST API"` was copied literally into all three modules.** An example that looks like a value gets used as one; v3 uses `"<the module's name: …>"` and got it right.
- **Free-tier limits shaped the runner, not the prompt:** the conversion didn't fit Groq's 8k tokens-per-minute in one request, so `generate:cases` converts per module and merges + counts in code (arithmetic belongs in code); Groq's strict JSON mode rejected a truncated reply, so it was dropped for lenient parsing.
- **No padding:** 31 scenarios in, 31 cases out, `warnings: []` — the "say so instead of padding" rule held.

---

## Current prompts (v3) — verbatim

### `system.md`

```text
You are a senior SDET who writes release-gating regression suites. You are precise about what is observable, sceptical of assumptions, and you would rather report a gap than write a test that passes for the wrong reason.

Rules that apply to every answer:
- The system facts you are given override your expectations of how apps usually behave. If a fact says the app does X, never assert that it does something else.
- Assert an exact message or field value ONLY if the facts give it. Otherwise assert the status code and that a message is present — or tag the scenario @assumption and quote your guess in a comment line.
- Use only the test ids and endpoints listed in the facts. Needing one that is not listed is an @assumption.
- Test data must be unique per run: emails like <unique-id>@example.com, never a fixed address.

Follow the OUTPUT CONTRACT in each message exactly. Do not add commentary outside the requested format unless the message asks for it.
```

### `00-context.md`

```text
I'm building a regression suite for a web app and its REST API. Before any test cases, hold the system facts below so later answers don't invent UI or endpoints that don't exist. Every fact here was verified against the live system on 2026-10-30.

SYSTEM UNDER TEST — ExpandTesting "Notes" practice app

UI (React SPA), base https://practice.expandtesting.com/notes/app/
- /login: email input (data-testid=login-email, type=text), password (login-password, type=password), submit button (login-submit). Server errors appear in a toast (alert-message). Client-side validation shows inline messages, e.g. "Email address is invalid", "Password should be between 6 and 30 characters".
- A wrong password and an unknown email both show "Incorrect email address or password".
- /forgot-password: email input (forgot-password-email), submit (forgot-password-submit).
- Dashboard (/notes/app/ when logged in): note cards (note-card, note-card-title, note-card-description, toggle-note-switch), category filter BUTTONS category-all / category-home / category-work / category-personal (not a dropdown), search (search-input, search-btn), add note (add-new-note), progress text (progress-info) e.g. "You have 1/4 notes completed in the all categories", logout BUTTON (logout).
- The session token is stored in localStorage under "token".
- Logged out, /notes/app/ shows a public landing page ("Welcome to Notes App"). It does NOT redirect to /login.
- A revoked or invalid token makes the app redirect to /login.
- There are no user roles and no admin features.

REST API, base https://practice.expandtesting.com/notes/api
- Auth header: x-auth-token: <token> (NOT Authorization: Bearer).
- Response envelope: { success, status, message, data? }.
- POST /users/register {name, email, password} → 201; duplicate email → 409.
- POST /users/login → 200 with the token at data.token; bad credentials → 401.
- GET /users/profile · DELETE /users/logout (revokes the token) · DELETE /users/delete-account · POST /users/forgot-password {email}.
- POST /notes {title 4–100 chars, description 4–1000 chars, category Home|Work|Personal} → 200.
- GET /notes · GET | PUT | PATCH | DELETE /notes/:id, where id is a 24-hex ObjectId.
- Note fields: id, title, description, category, completed, created_at, updated_at, user_id.
- Unknown id → 404; malformed id → 400; validation errors → 400 with a message naming the field.
- Rate limiting: not documented either way.

Do not write test cases yet. Reply with:
1. A 5-bullet summary of the system as you understand it.
2. Anything above that is ambiguous, or that you would want verified before writing a test against it.
```

### `01-login.md`

```text
TASK: Write regression test cases for the LOGIN module of the system above.

ROLE: You are writing the suite that gates releases. A case you miss is a defect that ships; a case that can pass for the wrong reason is worse than no case.

REQUIRED COVERAGE — every item, explicitly:
1. Valid login
2. Invalid credentials
3. Forgot password
4. Session expiry
5. Brute-force / repeated failed attempts

CONSTRAINTS:
- One case per distinct FAILURE MODE. Do not write variations of "wrong password shows an error".
- Every Then step names an observable that can actually fail: a URL, a test id, an exact message, a stored token, a network request. "The user is logged in successfully" is not an assertion.
- Include at least two security cases a functional tester would miss. User enumeration through the login message is one; find another in this module.
- Session expiry must be deterministic and run in under 5 seconds. No "wait 30 minutes".
- Lockout behaviour is NOT documented. Write the brute-force case so it is honest under either behaviour, and say what it records.
- Do not assume behaviour that is not in the system facts. If a case depends on an assumption, tag it @assumption and state the assumption in a comment line above the scenario.
- Each case creates its own user through the API in a Given step. No shared accounts.

OUTPUT CONTRACT:
- Gherkin only: one Feature, no prose outside it.
- One Scenario per case; a Scenario Outline only where the same assertion runs over different data.
- Every scenario title starts with its ID: TC-LOGIN-001, TC-LOGIN-002, …
- Tags: exactly one of @positive / @negative, plus at least one of @smoke @security @session @validation.
- 7 to 10 scenarios.

SELF-CHECK before answering: for each scenario ask "could this pass while the feature is broken?" If yes, tighten its Then steps.
```

### `02-dashboard.md`

```text
TASK: Same system, same role, same output contract. Now the DASHBOARD module. IDs: TC-DASH-001, TC-DASH-002, …

REQUIRED COVERAGE — every item, explicitly:
1. Widget loading
2. Data accuracy
3. Filter / sort behaviour
4. Responsive layout
5. Permission-based visibility

CONSTRAINTS:
- Data accuracy must compare the UI to a SOURCE OF TRUTH: the API response, or data the test seeded itself. Reading a number off the screen and comparing it to the same screen proves nothing.
- Filters: assert BOTH directions. The list narrows, every remaining note belongs to the filter, AND no matching note is missing. A count alone passes a filter that returns the wrong rows.
- Sort: there is no sort control. State the ordering you expect as an @assumption, and test it as behaviour (what happens to the order when a note changes), not only as a static snapshot.
- Responsive: assert what a user feels (horizontal scrolling, controls still usable), never pixel widths of specific elements.
- Permission visibility: this app has no roles. Interpret "permission" as what a logged-out visitor and a different user can reach. Test direct URLs — hiding a link is not access control.
- Each case seeds its own notes through the API. Never depend on pre-existing data.

OUTPUT CONTRACT: as for Login, with a Scenario Outline for the category filter across Home / Work / Personal. 8 to 11 scenarios.

SELF-CHECK: as for Login.
```

### `03-api.md`

```text
TASK: Same system, same role, same output contract. Now the REST API. IDs: TC-API-001, TC-API-002, …

REQUIRED COVERAGE — every item, explicitly:
1. Auth token validation
2. CRUD operations
3. Error handling (4xx / 5xx)
4. Rate limiting
5. Schema validation

CONSTRAINTS:
- Separate "the server rejected bad input" (assert the specific 4xx) from "the server fell over" (assert NOT 5xx). Several cases must assert the absence of 5xx explicitly.
- Schema validation means field presence AND types AND formats (ObjectId, ISO-8601 timestamps, enums). List them in the steps. "Status is 200" is not schema validation.
- Cover authorization, not only authentication: user B must not read, update or delete user A's note.
- Token validation includes the token's lifecycle: a logged-out token must stop working.
- CRUD is ONE lifecycle case that proves delete really deleted (re-read → 404), not four disconnected cases.
- Rate limiting is undocumented. The case must pass whether or not the API throttles, fail on any 5xx or unexpected status, and record which behaviour it saw. Do not assert a 429.
- Every case creates and deletes its own users and data, so the suite can run in parallel.

OUTPUT CONTRACT: as for Login. 10 to 13 scenarios.

SELF-CHECK: as for Login, and confirm every endpoint you used appears in the system facts.
```

### `04-to-json.md`

```text
TASK: Convert the three feature files above into one JSON document.

SHAPE:
{
  "modules": [
    { "name": "<the module's name: Login, Dashboard or REST API>",
      "cases": [ { "id", "title", "priority", "type", "tags", "preconditions", "steps", "expected", "assumptions" } ] }
  ],
  "coverage": { "total", "byModule", "byPriority" },
  "warnings": []
}

RULES:
- IDs and titles must match the Gherkin exactly. If they drift, the two files are useless to each other.
- priority: P0 only when a failure means "do not ship"; P1 = fix this sprint; P2 = everything else.
- assumptions: copy any @assumption notes; an empty array if there are none.
- Do NOT invent cases that are not in the Gherkin. If your count differs from the number of scenarios, say so in "warnings" instead of padding.

OUTPUT CONTRACT: only the JSON object — no markdown fence, no prose.
```

---

## Earlier versions — verbatim

<details>
<summary><b>v2</b> — <code>system.md</code> and <code>04-to-json.md</code> as run in run 1 (00–03 were identical to v3)</summary>

`system.md` (v2):

```text
You are a senior SDET who writes release-gating regression suites. You are precise about what is observable, sceptical of assumptions, and you would rather report a gap than write a test that passes for the wrong reason.

Follow the OUTPUT CONTRACT in each message exactly. Do not add commentary outside the requested format unless the message asks for it.
```

`04-to-json.md` (v2):

```text
TASK: Convert the three feature files above into one JSON document.

SHAPE:
{
  "modules": [
    { "name": "Login | Dashboard | REST API",
      "cases": [ { "id", "title", "priority", "type", "tags", "preconditions", "steps", "expected", "assumptions" } ] }
  ],
  "coverage": { "total", "byModule", "byPriority" },
  "warnings": []
}

RULES:
- IDs and titles must match the Gherkin exactly. If they drift, the two files are useless to each other.
- priority: P0 only when a failure means "do not ship"; P1 = fix this sprint; P2 = everything else.
- assumptions: copy any @assumption notes; an empty array if there are none.
- Do NOT invent cases that are not in the Gherkin. If your count differs from the number of scenarios, say so in "warnings" instead of padding.

OUTPUT CONTRACT: only the JSON object — no markdown fence, no prose.
```

</details>

<details>
<summary><b>v1</b> — the five prompts from the claude.ai scaffold session</summary>

#### Prompt 1 — context priming (run first, in a fresh conversation)

```
You are helping me build a regression suite for a QA assessment. Before we
write anything, I want you to hold the system facts so you stop inventing UI
that doesn't exist.

System under test: the ExpandTesting "Notes" practice app.
- UI base: https://practice.expandtesting.com/notes/app
- Login page: /login, Register: /register, Dashboard: /
- API base: https://practice.expandtesting.com/notes/api
- Auth header is x-auth-token (NOT Authorization: Bearer)
- Response envelope is { success, status, message, data }
- Login token lives at data.token
- Notes have: id, title, description, category (Home|Work|Personal),
  completed, created_at, updated_at, user_id
- Endpoints: GET /health-check, POST /users/register, POST /users/login,
  GET /users/profile, DELETE /users/delete-account, and CRUD on /notes

Do not write any test cases yet. Reply with a 5-bullet summary of what you
understand the system to be, and flag anything above that you think is
ambiguous or that you'd want to verify before writing tests against it.
```

#### Prompt 2 — Login module

```
Write test cases for the Login module of the app described above.

Role: you are a senior SDET writing the regression suite that gates releases.
A case you miss is a defect that ships.

Required coverage (all five, explicitly):
valid login, invalid credentials, forgot password, session expiry,
brute-force / repeated failed attempts.

Constraints — these matter more than the coverage list:
- Do NOT write five variations of "enter wrong password, see an error". One
  negative credential case is enough; spend the rest on different FAILURE
  MODES, not different wrong inputs.
- Every case must have an assertion that can actually fail. "Verify the user
  is logged in successfully" is not an assertion. Name the observable thing.
- Include at least two cases that a functional tester would miss but a
  security-minded one would not. User enumeration via differing error messages
  is the obvious one; find another.
- For session expiry, do not write "wait 30 minutes". Give me a case that is
  deterministic and runs in under 5 seconds.
- If a behaviour cannot be verified against this specific target, say so
  instead of writing a case that will produce a false pass.

Output: Gherkin. One Scenario per case. Tag each with @positive/@negative plus
a domain tag (@security, @session, @validation). ID each scenario
TC-LOGIN-00N in the scenario title. No prose outside the feature file.
```

#### Prompt 3 — Dashboard module

```
Same system, same role. Now the Dashboard module.

Required coverage: widget loading, data accuracy, filter/sort behaviour,
responsive layout, permission-based visibility.

Constraints:
- "Data accuracy" must mean comparing the UI against a SOURCE OF TRUTH, not
  against itself. A case that reads a number off the screen and asserts it
  equals the same number off the screen is worthless. Intercept the API
  response and compare to the rendered DOM.
- For the filter case, assert BOTH directions: that the list narrows, AND that
  every surviving row actually matches the filter. Most filter bugs are
  false-positives that only the second assertion catches.
- For responsive, do not assert on pixel widths of specific elements — those
  break on any CSS change. Assert on observable behaviour (no horizontal
  overflow, control still reachable).
- For permission visibility, test the direct-URL case, not just the hidden-link
  case. Hiding a link is not access control.
- Avoid any case whose result depends on a specific note existing, unless the
  case creates it first.

Output: same Gherkin format, TC-DASH-00N. Use a Scenario Outline where the
same assertion applies across categories.
```

#### Prompt 4 — REST API module

```
Same system, same role. Now the REST API.

Required coverage: auth token validation, CRUD operations, error handling
(4xx/5xx), rate limiting, schema validation.

Constraints:
- Separate "the server rejected my bad input" (correct, assert 4xx) from "the
  server fell over on my bad input" (a defect, assert NOT 5xx). Several cases
  should assert the absence of 5xx explicitly — that is the security-relevant
  assertion.
- Schema validation means field types and presence, not just "status is 200".
  Specify the exact fields and types to validate.
- Include an authorization case, not just an authentication one: user A must
  not be able to read user B's note by id. This is the bug class that actually
  reaches production.
- Every case must create and clean up its own data so the suite can run in
  parallel and leave nothing behind.
- For rate limiting: I don't know whether this target throttles. Write the
  case so it passes under EITHER behaviour but fails on a 5xx or an
  unexpected status. Do not assume a 429.
- CRUD should be one lifecycle case that proves deletion actually deleted,
  not four disconnected cases.

Output: same Gherkin format, TC-API-00N.
```

#### Prompt 5 — convert to machine-readable

```
Convert the Gherkin from the three modules above into a single JSON file.

Shape: { modules: [ { name, spec, cases: [...] } ] }
Each case: id, title, priority (P0/P1/P2), type, tags, preconditions, steps,
expected, automated.

Rules:
- IDs must match the Gherkin exactly. If they drift, the two files are useless
  to each other.
- Assign priority yourself, and justify nothing — but use P0 only for cases
  where a failure means "do not ship".
- Add a coverage block at the end: totals by priority, automated vs manual.
- Do not invent cases that aren't in the Gherkin. If the count doesn't match,
  tell me rather than padding.
```

</details>

---

## The runtime prompts (Task 3) iterated the same way

The failure explainer and classifier prompts live in code
([`failure-explainer.ts`](src/ai/failure-explainer.ts),
[`flaky-classifier.ts`](src/ai/flaky-classifier.ts)) and were revised from
real demo runs on `gpt-oss-120b` — outputs for every run are in
[`samples/`](samples/README.md):

| Run | Observed | Change |
|---|---|---|
| 1 | Agent found and verified `login-submit`, wrote "test id renamed" — and labelled it **real_bug**. Verdict rules only defined `test_defect` for text/status assertions. | Verdict defined by *where* the defect is; selector drift named explicitly. Added "preserve what the test proves — never weaken an assertion to make it pass". |
| 2 | Right diagnosis, but written as markdown instead of the tag block → parser defaulted to real_bug. | One **self-correction turn** when the block is missing, instead of a silent default. |
| 3 | Classifier, told to prefer test_defect for test-side causes, filed a failed-then-passed test as test_defect. | "Flaky outcome is always flaky_test" in the prompt **and** enforced in code — hard evidence shouldn't depend on prompt compliance. Demo specs' explanatory comments moved away from the failing lines (they were handing the agent the answer). |
| 4 | All 7 failures in the intended bucket; verified locator; missing-precondition fix is "add a login step, keep the 200 assertion". | — |

---

## Reusable template

```text
TASK: <module>, <output>.

ROLE: You are writing the suite that gates releases. A case you miss is a
defect that ships; a case that can pass for the wrong reason is worse than no case.

REQUIRED COVERAGE — every item, explicitly:
1. …

CONSTRAINTS:
- One case per distinct failure mode.
- Every Then step names an observable that can actually fail.
- <2–3 anti-patterns specific to this module>
- Do not assume behaviour that is not in the facts — tag it @assumption.
- Each case creates and cleans up its own uniquely-named data.

OUTPUT CONTRACT: <format, ID scheme, tags, count range>. Nothing outside it.

SELF-CHECK: for each case, "could this pass while the feature is broken?"
```

The constraint I'd keep above all others: **permission to report a gap.** A
model's default is to satisfy the request — it will write a plausible test for
behaviour that doesn't exist rather than say it doesn't exist. `@assumption`
turns those guesses into a list you can check in minutes.
