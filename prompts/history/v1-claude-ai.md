# v1 prompts — verbatim

The first-draft prompts that came with the initial scaffold of this repo (see ai-usage-log.md).
Kept unedited as the starting point of the iteration recorded in prompts.md.

## Prompt 1 — context priming (run first, in a fresh conversation)

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

## Prompt 2 — Login module

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

## Prompt 3 — Dashboard module

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

## Prompt 4 — REST API module

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

## Prompt 5 — convert to machine-readable

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
