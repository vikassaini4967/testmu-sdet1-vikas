import { test, expect } from '../../src/fixtures/ui-fixture.js';

/**
 * These tests FAIL ON PURPOSE. Run with `npm run demo`.
 *
 * They exist so the AI layer can be seen working without waiting for a real
 * regression. Each reproduces a different failure SHAPE, because the point is
 * that the agent pulls different evidence depending on what broke — and that
 * the run-level classifier puts each in a different bucket:
 *
 *   selector drift   → test_defect, with a verified replacement locator
 *                      (the real control is data-testid="login-submit")
 *   copy change      → test_defect (the heading reads "Login")
 *   phone overflow   → real_bug (KNOWN-BUG-001, without the test.fail marker)
 *   timing race      → flaky_test: attempt 1 gives a real network round trip
 *                      50ms and fails; the retry uses a sane timeout and passes.
 *                      The classic "red in CI, green on rerun" shape.
 *
 * Explanations live up here, not next to the failing lines: the agent reads
 * the source around the failure, and a comment there would hand it the answer.
 * Only loaded when AI_DEMO=1 (see playwright.config.ts), so `npm test` stays green.
 */

test.describe('@ai-demo UI failures', () => {
  test('DEMO selector drift — renamed test id', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.emailInput.fill('someone@example.com');
    await loginPage.passwordInput.fill('Whatever#2026');

    await page.getByTestId('signin-button').click({ timeout: 4_000 });
  });

  test('DEMO copy change — heading text', async ({ loginPage, page }) => {
    await loginPage.goto();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to your account', { timeout: 4_000 });
  });

  test('DEMO real defect — page wider than a phone screen', async ({ loginPage, page }) => {
    await page.setViewportSize({ width: 412, height: 839 });
    await loginPage.goto();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'page must not scroll horizontally at 412px').toBeLessThanOrEqual(0);
  });
});

test.describe('@ai-demo flaky', () => {
  test.describe.configure({ retries: 1 });

  test('DEMO timing race — asserts before the response lands', async ({ loginPage }, testInfo) => {
    await loginPage.goto();
    await loginPage.login('race.check@example.com', 'Whatever#2026');

    const timeout = testInfo.retry === 0 ? 50 : 10_000;
    await expect(loginPage.alert).toHaveText('Incorrect email address or password', { timeout });
  });
});
