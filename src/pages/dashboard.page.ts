import type { Locator, Page } from '@playwright/test';
import type { Category } from '../api/schemas.js';

export type CategoryFilter = 'All' | Category;

export interface Progress {
  completed: number;
  total: number;
  /** "all categories", "work category", … */
  scope: string;
}

/**
 * Notes dashboard (/notes/app/) — note cards, category filter buttons,
 * search, progress counter, add-note and logout.
 *
 * Verified against the live app on 2026-10-30. Two things the original
 * generated page object got wrong, kept here as a note because the AI triage
 * demo reproduces exactly this kind of drift:
 *  - the category filter is four buttons (category-all/-home/-work/-personal),
 *    not a <select>
 *  - logout is a <button data-testid="logout">, not a link
 */
export class DashboardPage {
  readonly addNoteButton: Locator;
  readonly logoutButton: Locator;
  readonly profileLink: Locator;
  readonly notesList: Locator;
  readonly noteCards: Locator;
  readonly noteTitles: Locator;
  readonly progressInfo: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;

  constructor(private readonly page: Page) {
    this.addNoteButton = page.getByTestId('add-new-note');
    this.logoutButton = page.getByTestId('logout');
    this.profileLink = page.getByTestId('profile');
    this.notesList = page.getByTestId('notes-list');
    this.noteCards = page.getByTestId('note-card');
    this.noteTitles = page.getByTestId('note-card-title');
    this.progressInfo = page.getByTestId('progress-info');
    this.searchInput = page.getByTestId('search-input');
    this.searchButton = page.getByTestId('search-btn');
  }

  categoryButton(category: CategoryFilter): Locator {
    return this.page.getByTestId(`category-${category.toLowerCase()}`);
  }

  noteCard(title: string): Locator {
    return this.noteCards.filter({ has: this.page.getByTestId('note-card-title').getByText(title, { exact: true }) });
  }

  async goto(): Promise<void> {
    await this.page.goto('', { waitUntil: 'domcontentloaded' });
  }

  /**
   * Signs in by seeding the session token the app keeps in localStorage —
   * the UI login flow has its own spec, and repeating it in every dashboard
   * test only adds time and a second reason to fail. Injected once per tab
   * (guarded by sessionStorage) so a later logout is not undone on reload.
   */
  async openAs(token: string): Promise<void> {
    await this.page.addInitScript((value) => {
      if (!window.sessionStorage.getItem('__seeded')) {
        window.localStorage.setItem('token', value);
        window.sessionStorage.setItem('__seeded', '1');
      }
    }, token);
    await this.goto();
    // Not progressInfo: an account with zero notes renders no counter.
    await this.addNoteButton.waitFor();
  }

  async filterBy(category: CategoryFilter): Promise<void> {
    await this.categoryButton(category).click();
    // The counter re-renders with the new scope; waiting on it beats a sleep.
    const scope = category === 'All' ? 'all categories' : `${category.toLowerCase()} category`;
    await this.progressInfo.filter({ hasText: scope }).waitFor();
  }

  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await this.searchButton.click();
  }

  async titles(): Promise<string[]> {
    return (await this.noteTitles.allTextContents()).map((t) => t.trim());
  }

  async progress(): Promise<Progress> {
    const text = ((await this.progressInfo.textContent()) ?? '').trim();
    const match = text.match(/You have (\d+)\/(\d+) notes completed in the (.+)$/i);
    if (!match) throw new Error(`Unrecognised progress text: "${text}"`);
    return { completed: Number(match[1]), total: Number(match[2]), scope: match[3].toLowerCase() };
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
  }
}
