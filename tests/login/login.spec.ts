import { test, expect } from '../../src/fixtures/ui-fixture.js';
import { NotesApiClient } from '../../src/api/notes.client.js';

/**
 * LOGIN — test-cases/login.feature (TC-LOGIN-001 … 009).
 * Generated from prompts in prompts.md, then corrected against the live app;
 * prompts.md records what the generated cases got wrong.
 */

const GENERIC_ERROR = 'Incorrect email address or password';

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('TC-LOGIN-001 valid credentials land the user on the dashboard', async ({ account, loginPage, dashboardPage, page }) => {
    await loginPage.login(account.email, account.password);

    await expect(dashboardPage.logoutButton).toBeVisible();
    await expect(dashboardPage.addNoteButton).toBeVisible();
    await expect(page).toHaveURL(/\/notes\/app\/?$/);
    expect(await page.evaluate(() => localStorage.getItem('token')), 'session token stored').toBeTruthy();
  });

  test('TC-LOGIN-002 wrong password is rejected and no session is created', async ({ account, loginPage, page }) => {
    await loginPage.login(account.email, 'Definitely-Wrong-1');

    await expect(loginPage.alert).toHaveText(GENERIC_ERROR);
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => localStorage.getItem('token')), 'no token after a failed login').toBeNull();
  });

  test('TC-LOGIN-003 unknown email and wrong password are indistinguishable (no user enumeration)', async ({
    account,
    loginPage,
    page,
  }) => {
    const statuses: number[] = [];
    page.on('response', (res) => res.url().endsWith('/users/login') && statuses.push(res.status()));

    await loginPage.login(account.email, 'Definitely-Wrong-1');
    await expect(loginPage.alert).toBeVisible();
    const wrongPasswordMessage = await loginPage.alertText();

    await loginPage.goto();
    await loginPage.login(`nobody.${Date.now()}@example.com`, 'Definitely-Wrong-1');
    await expect(loginPage.alert).toBeVisible();
    const unknownEmailMessage = await loginPage.alertText();

    expect(unknownEmailMessage).toBe(wrongPasswordMessage);
    expect(statuses).toEqual([401, 401]);
  });

  test('TC-LOGIN-004 malformed email is rejected client-side without a network call', async ({ loginPage, page }) => {
    let loginRequests = 0;
    page.on('request', (req) => req.url().endsWith('/users/login') && loginRequests++);

    await loginPage.login('not-an-email', 'Whatever#2026');

    await expect(loginPage.fieldErrors.filter({ hasText: 'Email address is invalid' })).toBeVisible();
    expect(loginRequests, 'client-side validation should block the request').toBe(0);
  });

  test('TC-LOGIN-005 forgot password link reaches the recovery form', async ({ loginPage, forgotPasswordPage, page }) => {
    await loginPage.forgotPasswordLink.click();

    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(forgotPasswordPage.heading).toBeVisible();
    await expect(forgotPasswordPage.emailInput).toBeEditable();
    await expect(forgotPasswordPage.submitButton).toBeEnabled();
  });

  test('TC-LOGIN-006 a session revoked server-side is sent back to login', async ({
    account,
    loginPage,
    dashboardPage,
    page,
    request,
  }) => {
    await loginPage.login(account.email, account.password);
    await expect(dashboardPage.logoutButton).toBeVisible();

    // Deterministic expiry: revoke the exact token the browser holds, as the
    // server would on timeout — instead of waiting out a real TTL.
    const browserToken = await page.evaluate(() => localStorage.getItem('token'));
    const api = new NotesApiClient(request);
    api.setToken(browserToken);
    expect((await api.logout()).status()).toBe(200);

    await page.reload();

    await expect(page).toHaveURL(/\/login$/);
    await expect(dashboardPage.logoutButton).toHaveCount(0);
  });

  test('TC-LOGIN-007 repeated failed logins stay controlled (lockout behaviour recorded)', async ({ account, loginPage, page }) => {
    const statuses: number[] = [];
    page.on('response', (res) => res.url().endsWith('/users/login') && statuses.push(res.status()));

    for (let attempt = 1; attempt <= 5; attempt++) {
      await loginPage.login(account.email, `Wrong-Password-${attempt}`);
      await expect(loginPage.alert).toBeVisible();
      if (attempt < 5) await loginPage.goto();
    }

    await expect.poll(() => statuses.length).toBe(5);
    expect(statuses.filter((s) => s >= 500), `5xx during repeated failures: ${statuses}`).toEqual([]);
    expect(statuses.every((s) => s === 401 || s === 429), `unexpected statuses: ${statuses}`).toBe(true);
    await expect(loginPage.alert).toHaveText(/incorrect|too many|locked/i);

    // This target has no lockout. Asserting one would fail forever, so the
    // absence is recorded as a finding instead of hidden.
    if (!statuses.includes(429)) {
      test.info().annotations.push({
        type: 'security-observation',
        description: 'No lockout or throttling after 5 consecutive failed logins (all 401).',
      });
    }
  });

  test('TC-LOGIN-008 password is masked and never sent in the URL', async ({ loginPage, page }) => {
    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');

    const loginRequest = page.waitForRequest((req) => req.url().endsWith('/users/login'));
    await loginPage.login('masking.check@example.com', 'ShouldNotAppear#1');
    const req = await loginRequest;

    expect(req.method()).toBe('POST');
    expect(req.url()).not.toContain('ShouldNotAppear');
    expect(page.url()).not.toContain('ShouldNotAppear');
  });

  test('TC-LOGIN-009 forgot password does not reveal whether an account exists', async ({ forgotPasswordPage }) => {
    test.info().annotations.push({
      type: 'issue',
      description:
        'KNOWN-BUG-002: /users/forgot-password answers an unknown email with "No account found with the given email address" (401) — account enumeration, while /users/login is correctly generic.',
    });
    test.fail();

    await forgotPasswordPage.goto();
    await forgotPasswordPage.requestReset(`nobody.${Date.now()}@example.com`);

    await expect(forgotPasswordPage.alert).toBeVisible();
    await expect(forgotPasswordPage.alert).not.toHaveText(/no account|not found|does not exist|doesn't exist/i);
  });
});
