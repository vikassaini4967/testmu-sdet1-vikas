import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import {
  attachConsoleCapture,
  attachNetworkCapture,
  collectDom,
  collectSelectorCandidates,
  collectSourceSnippet,
  createLocatorProbe,
} from '../ai/context-collector.js';
import { triageAndAttach } from '../ai/attach.js';
import { createAccount, deleteAccount, type TestAccount } from '../data/accounts.js';
import { DashboardPage } from '../pages/dashboard.page.js';
import { LoginPage } from '../pages/login.page.js';
import { ForgotPasswordPage, LandingPage, NotePage } from '../pages/public.pages.js';
import { blockThirdParty } from '../utils/network.js';

/**
 * UI fixture. Specs import `test` from here and get, for free:
 *  - AI failure triage on every failing test (the `aiTriage` auto fixture)
 *  - third-party ad/analytics hosts blocked
 *  - throwaway accounts created through the API and deleted afterwards
 *
 * Triage runs AFTER `use()` returns but while `testInfo` and the page are
 * still live — the only window where `testInfo.attach()` still writes into
 * the HTML report and where `probe_locator` can check a fix against the real
 * DOM. A custom reporter runs too late for either.
 */
export const test = base.extend<{
  aiTriage: void;
  /** A registered user with no notes. */
  account: TestAccount;
  /** A registered user seeded with SEED_NOTES. */
  seededAccount: TestAccount;
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  landingPage: LandingPage;
  forgotPasswordPage: ForgotPasswordPage;
  notePage: NotePage;
}>({
  context: async ({ context }, use) => {
    await blockThirdParty(context);
    await use(context);
  },

  aiTriage: [
    async ({ page }, use, testInfo) => {
      const consoleLogs = attachConsoleCapture(page);
      const networkFailures = attachNetworkCapture(page);

      await use();

      if (testInfo.status === testInfo.expectedStatus) return;

      const error = testInfo.error;
      await triageAndAttach(
        testInfo,
        {
          testTitle: testInfo.title,
          testFile: path.relative(process.cwd(), testInfo.file).replace(/\\/g, '/'),
          project: testInfo.project.name,
          retry: testInfo.retry,
          durationMs: testInfo.duration,
          errorMessage: error?.message ?? 'Test failed without an error message.',
          errorStack: error?.stack,
          sourceSnippet: collectSourceSnippet(error?.stack, testInfo.file),
          url: page.isClosed() ? undefined : page.url(),
          domSnapshot: await collectDom(page),
          selectorCandidates: await collectSelectorCandidates(page),
          consoleLogs,
          networkFailures,
        },
        { probeLocator: createLocatorProbe(page) },
      );
    },
    // Own timeout: an agent loop on a free-tier model can wait out a 429.
    { auto: true, timeout: 180_000 },
  ],

  account: async ({ request }, use) => {
    const account = await createAccount(request);
    await use(account);
    await deleteAccount(request, account);
  },

  seededAccount: async ({ request }, use) => {
    const account = await createAccount(request, { seed: true });
    await use(account);
    await deleteAccount(request, account);
  },

  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  dashboardPage: async ({ page }, use) => use(new DashboardPage(page)),
  landingPage: async ({ page }, use) => use(new LandingPage(page)),
  forgotPasswordPage: async ({ page }, use) => use(new ForgotPasswordPage(page)),
  notePage: async ({ page }, use) => use(new NotePage(page)),
});

export { expect };
