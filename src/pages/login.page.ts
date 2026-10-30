import type { Locator, Page } from '@playwright/test';

/**
 * Login page (/notes/app/login).
 *
 * Locators use the app's own data-testid attributes where it provides them
 * (verified against the live page, 2026-10-30) and roles where it doesn't.
 * That isn't dogma — it directly improves the AI layer: when such a locator
 * fails, the selector candidates the agent reads contain the test ids and
 * accessible names it needs to propose a working replacement.
 */
export class LoginPage {
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  /** Toast shown for server-side errors ("Incorrect email address or password"). */
  readonly alert: Locator;
  /** Inline client-side validation messages under the fields. */
  readonly fieldErrors: Locator;
  readonly forgotPasswordLink: Locator;
  readonly registerLink: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Login' });
    this.emailInput = page.getByTestId('login-email');
    this.passwordInput = page.getByTestId('login-password');
    this.submitButton = page.getByTestId('login-submit');
    this.alert = page.getByTestId('alert-message');
    this.fieldErrors = page.locator('.invalid-feedback');
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password' });
    this.registerLink = page.getByTestId('register-view');
  }

  async goto(): Promise<void> {
    await this.page.goto('login', { waitUntil: 'domcontentloaded' });
    await this.emailInput.waitFor();
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async alertText(): Promise<string> {
    return ((await this.alert.textContent()) ?? '').trim();
  }
}
