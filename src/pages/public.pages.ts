import type { Locator, Page } from '@playwright/test';

/** Logged-out home at /notes/app/ — what a visitor sees instead of the dashboard. */
export class LandingPage {
  readonly heading: Locator;
  readonly loginLink: Locator;
  readonly registerLink: Locator;

  constructor(page: Page) {
    this.heading = page.getByRole('heading', { name: 'Welcome to Notes App' });
    this.loginLink = page.getByTestId('open-login-view').getByRole('link', { name: 'Login' });
    this.registerLink = page.getByTestId('open-register-view');
  }
}

/** /notes/app/forgot-password */
export class ForgotPasswordPage {
  readonly heading: Locator;
  readonly emailInput: Locator;
  readonly submitButton: Locator;
  readonly alert: Locator;
  readonly fieldErrors: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Reset your password' });
    this.emailInput = page.getByTestId('forgot-password-email');
    this.submitButton = page.getByTestId('forgot-password-submit');
    this.alert = page.getByTestId('alert-message');
    this.fieldErrors = page.locator('.invalid-feedback');
  }

  async goto(): Promise<void> {
    await this.page.goto('forgot-password', { waitUntil: 'domcontentloaded' });
  }

  async requestReset(email: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }
}

/** Single note view at /notes/app/notes/:id */
export class NotePage {
  readonly notFound: Locator;

  constructor(private readonly page: Page) {
    this.notFound = page.getByText('No note found with the provided ID');
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`notes/${id}`, { waitUntil: 'domcontentloaded' });
  }
}
