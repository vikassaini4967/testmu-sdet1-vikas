# AI triage report

**Run:** `run-1793339425305` · **status:** failed · 0 passed, 6 failed, 1 flaky, 0 skipped (7 total)
**Generated:** 2026-10-30T05:51:54.044Z · **Model:** `groq/openai/gpt-oss-120b`

## Run summary

The run shows a mix of test defects, one genuine responsiveness bug, a flaky test, and an environment connectivity failure. Most failures are due to outdated test expectations rather than code regressions.

## Buckets

### 🐞 Real bug (1)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO real defect — page wider than a phone screen | high | FF | Horizontal overflow at mobile viewport indicates a real responsiveness defect. |

### 🌍 Environment issue (1)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO environment — service unreachable | high | FF | Connection refused error shows the service endpoint is unreachable. |

### 🎲 Flaky test (0)

_None._

### 🧪 Test defect (app OK, test is wrong/outdated) (5)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO selector drift — renamed test id | high | FF | Timeout caused by a renamed test‑id, as indicated by the per‑failure verdict and summary. |
| DEMO copy change — heading text | high | FF | Heading text mismatch stems from changed copy, per the agent verdict. |
| DEMO timing race — asserts before the response lands | high | ~~ | Flaky outcome is due to a test‑side timing issue, not a product bug. |
| DEMO wrong status expectation — invalid login expected to succeed | high | FF | Test expects 200 for invalid credentials but API correctly returns 401. |
| DEMO missing precondition — protected route called without a token | high | FF | Test asserts 200 without authentication, while API returns proper 401. |

## 🩹 Self-healing proposals

Proposed, never auto-applied: a suite that silently repairs itself stops telling you the app changed. "Verified" means our code saw the locator match exactly one visible element on the live page at failure time.

| Test | Proposed locator | Verified |
|---|---|---|
| DEMO selector drift — renamed test id | `page.getByTestId('login-submit')` | ✅ 1 visible match |

## Per-failure explanations

### DEMO selector drift — renamed test id

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Test uses renamed test‑id, causing a timeout.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 4 step(s) · get_selector_candidates → get_selector_candidates → probe_locator

**Root cause** — The login button’s test‑id was changed from `signin-button` to `login-submit`. The locator now matches no element, leading to a 4 s click timeout. The page loads correctly; the app behavior is unchanged.

**Suggested fix**

Replace the stale selector with the current one:

```ts
// Old
await page.getByTestId('signin-button').click({ timeout: 4_000 });

// New
await page.getByTestId('login-submit').click({ timeout: 4_000 });
```

---

### DEMO copy change — heading text

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Heading copy changed from expected string.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The page now displays <h1>Login</h1> instead of the expected "Sign in to your account". This indicates a deliberate copy update in the application, not a locator or timing issue. The test’s expected text is outdated.

**Suggested fix**

Update the expected heading text in the test:\n```ts\n- await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to your account', { timeout: 4_000 });\n+ await expect(page.getByRole('heading', { level: 1 })).toHaveText('Login', { timeout: 4_000 });\n```

---

### DEMO real defect — page wider than a phone screen

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Page overflows horizontally at mobile viewport, indicating a responsiveness defect.**

- **Verdict:** 🐞 Real bug (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The application’s layout does not adapt to a 412 px viewport, causing the document width to exceed the client width by 90 px. This is a UI responsiveness issue, not a test or environment problem. The test correctly sets the viewport and checks overflow, so the failure reflects a defect in the app’s CSS/media queries.

**Suggested fix**

Update the app’s CSS to ensure all containers use responsive units (e.g., max-width: 100%, flexbox/grid) and add appropriate media queries so that at 412 px width no horizontal scroll occurs.

---

### DEMO timing race — asserts before the response lands

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Test expects a retry but retries are not enabled, causing a guaranteed first‑run timeout.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test deliberately uses a 50 ms timeout on the first attempt to provoke a failure, then relies on Playwright’s retry mechanism to rerun the test with a 10 s timeout. In the current CI configuration `testInfo.retry` is always 0 because retries are disabled, so the second attempt never runs and the locator times out. The failure is not due to a missing element or selector drift.

**Suggested fix**

Enable retries for this test (or globally) and keep the existing logic, e.g.:

```ts
// In playwright.config.ts
export default defineConfig({
  retries: 1, // enable one retry
  // …
});
```

or, if you prefer to keep the test without relying on retries, remove the race simulation:

```ts
// tests/demo/ui-demo.spec.ts
// const timeout = testInfo.retry === 0 ? 50 : 10_000;
await expect(loginPage.alert).toHaveText(
  'Incorrect email address or password',
  { timeout: 10_000 }
);
```

---

### DEMO wrong status expectation — invalid login expected to succeed

`tests/demo/api-demo.spec.ts` · project `demo-api`

**Test expects success for invalid credentials, but API correctly returns 401.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test deliberately uses wrong credentials (email = 'nobody@example.com', password = 'wrong-password'). The API returns 401 Unauthorized, which is the correct behavior. The assertion erroneously expects HTTP 200, indicating the test's expectation is outdated or incorrect.

**Suggested fix**

Update the expectation to match the API behavior:\n```ts\n- expect(response.status()).toBe(200);\n+ expect(response.status()).toBe(401);\n```

---

### DEMO missing precondition — protected route called without a token

`tests/demo/api-demo.spec.ts` · project `demo-api`

**Test asserts 200 on unauthenticated request, but API correctly returns 401.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test deliberately clears the auth token (line 21) and then calls a protected endpoint. The backend returns 401 Unauthorized, which is the expected behavior. The test’s expectation of a 200 OK status is outdated or incorrect, likely copied from a scenario where authentication was present.

**Suggested fix**

Update the assertion to expect a 401 status, reflecting the correct unauthenticated response:

```ts
// tests/demo/api-demo.spec.ts
...
const response = await notesApi.listNotes();
expect(response.status()).toBe(401); // changed from 200
...
```

---

### DEMO environment — service unreachable

`tests/demo/api-demo.spec.ts` · project `demo-api`

**API request cannot connect because the target host/port is unreachable.**

- **Verdict:** 🌍 Environment issue (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test intentionally calls a service on 127.0.0.1:9, which is closed on normal machines, causing ECONNREFUSED. This indicates the test environment does not have the expected service running or the port is blocked, not a test logic error.

**Suggested fix**

Skip or mark the test as expected to fail when the service is down, or configure it to run only against an environment where the service is reachable. For example, add a check that the host is reachable before making the request, or guard the test with a condition like `test.skip(process.env.CI, 'Service unavailable in CI')`.

---

## Cost

11 LLM call(s) · 15,228 input / 2,355 output tokens · free tier
