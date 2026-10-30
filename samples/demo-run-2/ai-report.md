# AI triage report

**Run:** `run-1793339318213` · **status:** failed · 0 passed, 6 failed, 1 flaky, 0 skipped (7 total)
**Generated:** 2026-10-30T05:49:56.881Z · **Model:** `groq/openai/gpt-oss-120b`

## Run summary

The build shows a mix of genuine application bugs, several test defects, one flaky test, and an environment issue, indicating both code problems and test maintenance needs.

## Buckets

### 🐞 Real bug (2)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO selector drift — renamed test id | low | F | Timeout locating signin-button, matching perFailureAgent low‑confidence real_bug. |
| DEMO real defect — page wider than a phone screen | high | F | Horizontal overflow detected, matching high‑confidence real_bug. |

### 🌍 Environment issue (1)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO environment — service unreachable | high | F | Connection refused error shows external service is unreachable. |

### 🎲 Flaky test (1)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO timing race — asserts before the response lands | high | ~ | Test failed initially then passed on retry, indicating flakiness. |

### 🧪 Test defect (app OK, test is wrong/outdated) (3)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO copy change — heading text | high | F | Heading copy changed; test expects outdated text per summary. |
| DEMO wrong status expectation — invalid login expected to succeed | high | F | Test expects 200 but receives 401, a clear test‑side mistake. |
| DEMO missing precondition — protected route called without a token | high | F | Test expects 200 while correctly getting 401, indicating wrong expectation. |

## Per-failure explanations

### DEMO selector drift — renamed test id

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Model did not return a structured summary.**

- **Verdict:** 🐞 Real bug (low confidence)
- **Agent path:** 4 step(s) · get_selector_candidates → get_selector_candidates → probe_locator

**Root cause** — The test is looking for a stale test‑id. The login button’s test‑id was renamed to **login-submit**, so the locator `getByTestId('signin-button')` never finds an element and times out.

**Verdict:** test_defect  
**Confidence:** high  
**Summary:** Locator points to a renamed test‑id; element exists under a new id.  
**Root cause:** The app renamed the submit button’s `data-testid` from `signin-button` to `login-submit`. The test still uses the old id, causing a timeout. No timing or environment issue; the test is outdated.  
**Suggested fix:** Update the locator to the current test‑id.

```ts

**Suggested fix**

No fix suggested.

---

### DEMO copy change — heading text

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Heading copy changed; test expects outdated text.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The application now displays <h1>Login</h1> on the login page, whereas the test was written for the previous copy “Sign in to your account”. The locator is correct (it finds the <h1> element). This is a pure test‑code mismatch, not a UI or environment issue.

**Suggested fix**

Update the expected text in the assertion:

```ts
// tests/demo/ui-demo.spec.ts
- await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to your account', { timeout: 4_000 });
+ await expect(page.getByRole('heading', { level: 1 })).toHaveText('Login', { timeout: 4_000 });
```

---

### DEMO real defect — page wider than a phone screen

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Page overflows horizontally at 412 px viewport, violating responsive design.**

- **Verdict:** 🐞 Real bug (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The app’s layout does not constrain width for small viewports, causing the document’s scrollWidth to exceed clientWidth by ~90 px. No test or selector issue; the failure is deterministic and reproducible. This horizontal overflow is a user‑visible defect on mobile screens.

**Suggested fix**

In the main stylesheet (e.g., `styles.css`), add a rule to prevent horizontal overflow for small screens:

```css
/* Prevent horizontal scrolling on mobile */
@media (max-width: 420px) {
  html, body {
    overflow-x: hidden;
  }
}
```

Or adjust the container widths/flex settings so elements never exceed the viewport width.

---

### DEMO timing race — asserts before the response lands

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Timeout too short causes assertion to fail before alert appears.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test intentionally uses a 50 ms timeout on the first attempt, but the alert element is rendered after the network round‑trip, which exceeds this window. Playwright treats the timeout as a failure, and the test never reaches the retry where the longer timeout would succeed. The test logic assumes a failure on first run, but the framework aborts the test on that failure.

**Suggested fix**

Replace the race‑condition assertion with a proper wait, e.g.:

```ts
// Remove artificial short timeout
await expect(loginPage.alert).toHaveText(
  'Incorrect email address or password',
  { timeout: 10_000 }
);
```

If you still want to verify the race, wrap the first expect in a try/catch and ignore the timeout error, then let the retry handle the real check.

---

### DEMO wrong status expectation — invalid login expected to succeed

`tests/demo/api-demo.spec.ts` · project `demo-api`

**Test expects a successful login but supplies invalid credentials.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test deliberately uses a non‑existent user and wrong password, causing the API to return 401. The assertion incorrectly expects HTTP 200, so the failure is due to a wrong expectation in the test, not the application.

**Suggested fix**

Update the expectation to match the API behavior:

```ts
// tests/demo/api-demo.spec.ts
- expect(response.status()).toBe(200);
+ expect(response.status()).toBe(401);
``` 

Optionally add a comment clarifying the intent.

---

### DEMO missing precondition — protected route called without a token

`tests/demo/api-demo.spec.ts` · project `demo-api`

**Test expects 200 but correctly receives 401 for unauthenticated request.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test deliberately clears the auth token, then calls a protected endpoint. The API returns 401 Unauthorized, which is the correct behavior. The assertion mistakenly expects a 200 OK, indicating the test was written with the wrong expected status.

**Suggested fix**

Update the expectation to match the actual behavior:
```ts
expect(response.status()).toBe(401);
```

---

### DEMO environment — service unreachable

`tests/demo/api-demo.spec.ts` · project `demo-api`

**Test expects a successful response from a deliberately closed port.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test calls a health‑check endpoint on 127.0.0.1:9, a port that is intentionally closed. The request fails with ECONNREFUSED, causing `response.ok()` to be false while the assertion expects true. The test’s expectation is inverted.

**Suggested fix**

Update the assertion to expect a failed response, e.g.:

```ts
const response = await request.get('http://127.0.0.1:9/notes/api/health-check', { timeout: 5_000 });
expect(response.ok()).toBe(false); // service should be unreachable
```

---

## Cost

11 LLM call(s) · 15,127 input / 2,526 output tokens · free tier
