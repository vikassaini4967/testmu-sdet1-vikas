# AI triage report

**Run:** `run-1793339183211` · **status:** failed · 0 passed, 6 failed, 1 flaky, 0 skipped (7 total)
**Generated:** 2026-10-30T05:47:27.802Z · **Model:** `groq/openai/gpt-oss-120b`

## Run summary

The build shows a mix of genuine bugs, several outdated or incorrect test expectations, one flaky test, and a service outage, indicating both product issues and test suite maintenance needs.

## Buckets

### 🐞 Real bug (2)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO selector drift — renamed test id | high | — | Timeout due to renamed test id indicates a functional defect. |
| DEMO real defect — page wider than a phone screen | high | — | Horizontal overflow at mobile viewport is a layout defect. |

### 🌍 Environment issue (1)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO environment — service unreachable | high | — | Connection refused indicates the target service is down. |

### 🎲 Flaky test (1)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO timing race — asserts before the response lands | high | — | Failed on first attempt, passed on retry, showing timing flakiness. |

### 🧪 Test defect (app OK, test is wrong/outdated) (3)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO copy change — heading text | high | — | Expected heading text no longer matches the app’s copy. |
| DEMO wrong status expectation — invalid login expected to succeed | high | — | Test expects 200 for invalid login but API correctly returns 401. |
| DEMO missing precondition — protected route called without a token | high | — | Test expects success on unauthenticated request but receives correct 401. |

## 🩹 Self-healing proposals

Proposed, never auto-applied: a suite that silently repairs itself stops telling you the app changed. "Verified" means our code saw the locator match exactly one visible element on the live page at failure time.

| Test | Proposed locator | Verified |
|---|---|---|
| DEMO selector drift — renamed test id | `page.getByTestId('login-submit')` | ✅ 1 visible match |

## Per-failure explanations

### DEMO selector drift — renamed test id

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Selector drift: test id renamed, causing timeout.**

- **Verdict:** 🐞 Real bug (high confidence)
- **Agent path:** 4 step(s) · get_selector_candidates → get_selector_candidates → probe_locator

**Root cause** — The login button's data-testid changed from signin-button to login-submit. The test still uses the old id, so the locator finds no element and times out.

**Suggested fix**

Replace `page.getByTestId('signin-button')` with `page.getByTestId('login-submit')`.

---

### DEMO copy change — heading text

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Expected heading text no longer matches the app’s current copy.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The page’s `<h1>` now contains “Login” instead of the previously expected “Sign in to your account”. This is a content change in the application, not a locator or timing issue. The test asserts the old static copy, so it fails consistently.

**Suggested fix**

Update the assertion to the current heading text:
```ts
await expect(page.getByRole('heading', { level: 1 }))
  .toHaveText('Login', { timeout: 4_000 });
```

---

### DEMO real defect — page wider than a phone screen

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Page overflows horizontally at mobile viewport, indicating a layout defect.**

- **Verdict:** 🐞 Real bug (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The login page contains elements or CSS that exceed the 412 px viewport width, causing a horizontal scroll. This is not a test timing or selector issue. The app fails to be responsive on small screens, which a user would notice.

**Suggested fix**

Update the page’s CSS/layout to constrain widths (e.g., use max-width: 100% on containers, avoid fixed widths larger than the viewport, and ensure input fields and buttons are responsive). Add a media query for max-width: 412px if needed.

---

### DEMO timing race — asserts before the response lands

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Test asserts alert too early; 50 ms timeout is unrealistic for network response.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test deliberately sets a 50 ms timeout on the first retry, expecting the server response to be slower. The alert element is not rendered within that window, so Playwright cannot find it, causing a locator‑not‑found error. The failure is therefore due to an overly aggressive timeout, not a UI or environment issue.

**Suggested fix**

Adjust the timeout logic to give the server a realistic window on the first attempt, e.g.:

```ts
// tests/demo/ui-demo.spec.ts
- const timeout = testInfo.retry === 0 ? 50 : 10_000;
+ const timeout = testInfo.retry === 0 ? 2000 : 10_000; // give server up to 2 s on first try
await expect(loginPage.alert).toHaveText('Incorrect email address or password', { timeout });
``` 

Alternatively, remove the artificial race test if it no longer serves a purpose.

---

### DEMO wrong status expectation — invalid login expected to succeed

`tests/demo/api-demo.spec.ts` · project `demo-api`

**Test expects success for invalid credentials but API correctly returns 401.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The login endpoint returns 401 for wrong credentials, which is correct behavior. The test mistakenly asserts a 200 status, likely copied from a successful login scenario.

**Suggested fix**

```ts
// Change expected status to 401 for invalid login
expect(response.status()).toBe(401);
```

---

### DEMO missing precondition — protected route called without a token

`tests/demo/api-demo.spec.ts` · project `demo-api`

**Test expects success on unauthenticated request but receives correct 401.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The API correctly returns 401 Unauthorized when no token is provided. The test asserts a 200 status, which is outdated or mis‑specified.

**Suggested fix**

Update the assertion to expect 401:\n```ts\n- expect(response.status()).toBe(200);\n+ expect(response.status()).toBe(401);\n```

---

### DEMO environment — service unreachable

`tests/demo/api-demo.spec.ts` · project `demo-api`

**Connection refused to localhost indicates the test target service is down.**

- **Verdict:** 🌍 Environment issue (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test attempts to call a health‑check endpoint on 127.0.0.1:9, a port that is intentionally closed on normal machines. The ECONNREFUSED error shows the service is unreachable, not a code bug. This is a test designed to verify handling of an unreachable environment, so the failure is expected when the service isn’t running.

**Suggested fix**

Either start the mock service on port 9 for this test, or change the test to point to a controllable fixture endpoint that can simulate a refusal. Example diff:
```ts
- const response = await request.get('http://127.0.0.1:9/notes/api/health-check', { timeout: 5_000 });
+ const response = await request.get('http://127.0.0.1:8080/mock-unavailable', { timeout: 5_000 });
```

---

## Cost

11 LLM call(s) · 13,531 input / 2,309 output tokens · free tier
