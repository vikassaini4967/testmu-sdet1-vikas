# AI triage report

**Run:** `run-1793339578362` · **status:** failed · 0 passed, 6 failed, 1 flaky, 0 skipped (7 total)
**Generated:** 2026-10-30T05:53:54.472Z · **Model:** `groq/openai/gpt-oss-120b`

## Run summary

The build shows several test defects due to updated UI and API expectations, a genuine layout bug, a flaky timing test, and an environment failure preventing API access.

## Buckets

### 🐞 Real bug (1)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO real defect — page wider than a phone screen | high | FFF | Horizontal scroll exceeds allowed width, reported as a real bug. |

### 🌍 Environment issue (1)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO environment — service unreachable | high | FFF | Connection refused error indicates the service is down or misconfigured. |

### 🎲 Flaky test (1)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO timing race — asserts before the response lands | high | ~~~ | Test fails first then passes on retry due to a 50 ms timeout race condition. |

### 🧪 Test defect (app OK, test is wrong/outdated) (4)

| Test | Confidence | History (P/F/~) | Why |
|---|---|---|---|
| DEMO selector drift — renamed test id | high | FFF | Locator timeout caused by renamed test‑id as indicated by the per‑failure summary. |
| DEMO copy change — heading text | high | FFF | Expected heading text mismatches actual copy, per the per‑failure summary. |
| DEMO wrong status expectation — invalid login expected to succeed | high | FFF | Test expects 200 but API correctly returns 401, a test‑side expectation error. |
| DEMO missing precondition — user lists their notes | high | — | Failure caused by missing authentication precondition as described in the summary. |

## 🩹 Self-healing proposals

Proposed, never auto-applied: a suite that silently repairs itself stops telling you the app changed. "Verified" means our code saw the locator match exactly one visible element on the live page at failure time.

| Test | Proposed locator | Verified |
|---|---|---|
| DEMO selector drift — renamed test id | `page.getByTestId('login-submit')` | ✅ 1 visible match |

## Per-failure explanations

### DEMO selector drift — renamed test id

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Test uses renamed test‑id; update locator.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 4 step(s) · get_selector_candidates → get_selector_candidates → probe_locator

**Root cause** — The login button's data‑testid changed from `signin-button` to `login-submit`. The test still looks for the old ID, causing a timeout.

**Suggested fix**

Replace `page.getByTestId('signin-button')` with `page.getByTestId('login-submit')`.

---

### DEMO copy change — heading text

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Heading copy changed; test expects old text.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The application now displays <h1>Login</h1> instead of the previous "Sign in to your account". The test’s expected string is outdated, causing the assertion to fail. This is a copy change, not a locator or app malfunction.

**Suggested fix**

Update the expectation to match the new copy:\n```ts\nawait expect(page.getByRole('heading', { level: 1 })).toHaveText('Login', { timeout: 4_000 });\n```

---

### DEMO real defect — page wider than a phone screen

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**App layout exceeds viewport width, causing horizontal scroll at 412 px.**

- **Verdict:** 🐞 Real bug (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The login page's CSS does not constrain content to the viewport width, likely due to a fixed‑width element or missing responsive rules. This results in a scrollWidth 90 px larger than clientWidth when the viewport is set to a phone size. The test correctly detects the overflow, so the failure is due to a UI defect, not the test.

**Suggested fix**

Update the page's stylesheet to enforce max-width: 100% (or appropriate breakpoint) on the main container and any child elements that exceed the viewport. For example:

```css
/* Add to the login page CSS */
body, .app-root {
  max-width: 100%;
  overflow-x: hidden;
}
```

---

### DEMO timing race — asserts before the response lands

`tests/demo/ui-demo.spec.ts` · project `demo-ui`

**Test asserts alert too early with a 50 ms timeout, causing a race condition.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The login request takes longer than 50 ms to return an error message, so the `alert-message` element isn’t present when the expectation runs. The test’s logic intentionally sets a tiny timeout on the first retry, which is unrealistic for the app’s response time.

**Suggested fix**

```ts
// tests/demo/ui-demo.spec.ts
- const timeout = testInfo.retry === 0 ? 50 : 10_000;
+ // Give the app enough time to display the error after a failed login.
+ const timeout = testInfo.retry === 0 ? 2_000 : 10_000;
```

---

### DEMO wrong status expectation — invalid login expected to succeed

`tests/demo/api-demo.spec.ts` · project `demo-api`

**Test expects success on invalid credentials, but API correctly returns 401.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test case is asserting a 200 OK status for a login attempt with known-invalid credentials. The backend returns 401 Unauthorized, which is the correct behavior. The test’s expectation is outdated or incorrectly written.

**Suggested fix**

Update the assertion to expect 401, or rename the test to reflect that it verifies rejection of invalid login.\n```ts\n- expect(response.status()).toBe(200);\n+ expect(response.status()).toBe(401);\n```

---

### DEMO missing precondition — user lists their notes

`tests/demo/api-demo.spec.ts` · project `demo-api`

**Test lacks authentication before API call.**

- **Verdict:** 🧪 Test defect (app OK, test is wrong/outdated) (high confidence)
- **Agent path:** 2 step(s) · get_failure_history

**Root cause** — The test calls the notes endpoint without logging in, receiving 401; the assertion expects 200, so it fails.

**Suggested fix**

Add a login step before listNotes and keep the 200 assertion.

---

### DEMO environment — service unreachable

`tests/demo/api-demo.spec.ts` · project `demo-api`

**API endpoint refused connection, indicating the service is down or misconfigured.**

- **Verdict:** 🌍 Environment issue (high confidence)
- **Agent path:** 1 step(s) · no tools needed

**Root cause** — The test attempts to call http://127.0.0.1:9/notes/api/health-check, but the host rejects the connection (ECONNREFUSED). This is not a test or selector issue; the backend service expected to listen on port 9 is unavailable, likely due to the demo environment not being started, wrong port, or network restrictions. The failure persists across runs (no flaky pattern) and is unrelated to UI locators.

**Suggested fix**

Ensure the demo service is running and listening on port 9 before the test, or update the test URL to the correct health‑check endpoint/port. Example fix in the test setup:

```ts
test.beforeAll(async () => {
  // start or verify demo service is up
  await waitForService('http://127.0.0.1:9/notes/api/health-check');
});
```

---

## Cost

12 LLM call(s) · 16,075 input / 2,623 output tokens · free tier
