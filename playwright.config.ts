import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const isCI = !!process.env.CI;
const isDemo = process.env.AI_DEMO === '1';

/**
 * Trailing slash matters: the app lives under /notes/app/, and page objects
 * navigate with relative paths ('login', 'notes/:id'). A base without the
 * slash would resolve 'login' to /notes/login.
 */
const BASE_URL = (process.env.BASE_URL ?? 'https://practice.expandtesting.com/notes/app').replace(/\/?$/, '/');

/**
 * Two reporters do different jobs:
 *  - html: the normal Playwright report. AI explanations are attached to each
 *    failing test by the fixtures, so they show up under "Attachments".
 *  - ai-reporter: run-level triage — buckets, shared cause, self-healing
 *    proposals, cost — into ai-reports/, and the cross-run history.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  workers: isCI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['./src/reporters/ai-reporter.ts'],
    ...(isCI ? ([['github']] as const) : []),
  ],

  use: {
    baseURL: BASE_URL,
    // All of this also feeds the AI context on failure.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: isDemo
    ? [
        // Fail on purpose to demonstrate the AI layer: `npm run demo`.
        { name: 'demo-ui', testMatch: /demo\/ui-demo\.spec\.ts/, retries: 0, use: { ...devices['Desktop Chrome'] } },
        { name: 'demo-api', testMatch: /demo\/api-demo\.spec\.ts/, retries: 0 },
      ]
    : [
        // API specs never launch a browser.
        { name: 'api', testMatch: /api\/.*\.spec\.ts/ },
        {
          name: 'chromium',
          testMatch: /(login|dashboard)\/.*\.spec\.ts/,
          testIgnore: /responsive\.spec\.ts/,
          use: { ...devices['Desktop Chrome'] },
        },
        { name: 'mobile-chrome', testMatch: /dashboard\/responsive\.spec\.ts/, use: { ...devices['Pixel 7'] } },
      ],
});
