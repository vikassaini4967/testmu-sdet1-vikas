import { test, expect } from '../../src/fixtures/ui-fixture.js';
import type { Category, Note } from '../../src/api/schemas.js';
import { isThirdPartyNoise } from '../../src/utils/network.js';

/**
 * DASHBOARD — test-cases/dashboard.feature (TC-DASH-001 … 008).
 * Every test gets its own freshly seeded account (src/data/accounts.ts), so
 * the expected values below are derived from data the test itself created.
 */

/** The app's rule, verified live: open notes first, then completed; newest update first within each. */
function expectedOrder(notes: Note[]): string[] {
  const byUpdatedDesc = (a: Note, b: Note) => b.updated_at.localeCompare(a.updated_at);
  return [...notes.filter((n) => !n.completed).sort(byUpdatedDesc), ...notes.filter((n) => n.completed).sort(byUpdatedDesc)].map(
    (n) => n.title,
  );
}

test.describe('Dashboard', () => {
  test('TC-DASH-001 widgets finish loading with no first-party errors', async ({ seededAccount, dashboardPage, page }) => {
    const consoleErrors: string[] = [];
    const failedApiCalls: string[] = [];
    page.on('console', (msg) => {
      // Blocked ad hosts log "net::ERR_FAILED" with the URL only in the location, not the text.
      if (msg.type() === 'error' && !isThirdPartyNoise(`${msg.text()} ${msg.location().url}`)) consoleErrors.push(msg.text());
    });
    page.on('response', (res) => res.url().includes('/notes/api/') && res.status() >= 400 && failedApiCalls.push(`${res.status()} ${res.url()}`));

    await dashboardPage.openAs(seededAccount.token);

    await expect(dashboardPage.noteCards).toHaveCount(seededAccount.notes.length);
    for (const category of ['All', 'Home', 'Work', 'Personal'] as const) {
      await expect(dashboardPage.categoryButton(category)).toBeVisible();
    }
    await expect(dashboardPage.addNoteButton).toBeEnabled();
    await expect(dashboardPage.searchInput).toBeEditable();
    await expect(dashboardPage.progressInfo).toBeVisible();

    expect(consoleErrors, 'first-party console errors on load').toEqual([]);
    expect(failedApiCalls, 'failed API calls on load').toEqual([]);
  });

  test('TC-DASH-002 rendered notes and progress counter match the API response', async ({ seededAccount, dashboardPage, page }) => {
    // Source of truth = the response the app itself received, not the DOM read twice.
    const notesResponse = page.waitForResponse((res) => /\/notes\/api\/notes$/.test(res.url()) && res.request().method() === 'GET');
    await dashboardPage.openAs(seededAccount.token);
    const apiNotes = ((await (await notesResponse).json()) as { data: Note[] }).data;

    // …and that response must itself match what this test seeded.
    expect(apiNotes.map((n) => n.title).sort()).toEqual(seededAccount.notes.map((n) => n.title).sort());

    await expect(dashboardPage.noteCards).toHaveCount(apiNotes.length);
    expect((await dashboardPage.titles()).sort()).toEqual(apiNotes.map((n) => n.title).sort());
    expect(await dashboardPage.progress()).toEqual({
      completed: apiNotes.filter((n) => n.completed).length,
      total: apiNotes.length,
      scope: 'all categories',
    });
  });

  for (const category of ['Home', 'Work', 'Personal'] as Category[]) {
    test(`TC-DASH-003 [${category}] category filter shows exactly that category's notes`, async ({ seededAccount, dashboardPage }) => {
      const expected = seededAccount.notes.filter((n) => n.category === category);
      await dashboardPage.openAs(seededAccount.token);

      await dashboardPage.filterBy(category);

      // Both directions: nothing missing AND nothing extra. Count alone passes a filter that returns the wrong rows.
      expect((await dashboardPage.titles()).sort()).toEqual(expected.map((n) => n.title).sort());
      expect(await dashboardPage.progress()).toEqual({
        completed: expected.filter((n) => n.completed).length,
        total: expected.length,
        scope: `${category.toLowerCase()} category`,
      });
    });
  }

  test('TC-DASH-004 returning to "All" restores the original list in the original order', async ({ seededAccount, dashboardPage }) => {
    await dashboardPage.openAs(seededAccount.token);
    await expect(dashboardPage.noteCards).toHaveCount(seededAccount.notes.length);
    const original = await dashboardPage.titles();

    await dashboardPage.filterBy('Personal');
    await dashboardPage.filterBy('All');

    expect(await dashboardPage.titles()).toEqual(original);
  });

  test('TC-DASH-005 sort order: open notes first by latest update, completing a note moves it down', async ({
    seededAccount,
    dashboardPage,
  }) => {
    await dashboardPage.openAs(seededAccount.token);
    await expect(dashboardPage.noteCards).toHaveCount(seededAccount.notes.length);

    expect(await dashboardPage.titles()).toEqual(expectedOrder(seededAccount.notes));

    // Behaviour, not just a snapshot: completing the top note must re-sort it below every open note.
    const [top] = await dashboardPage.titles();
    await dashboardPage.noteCard(top).getByTestId('toggle-note-switch').click();

    const openCount = seededAccount.notes.filter((n) => !n.completed).length - 1;
    await expect.poll(async () => (await dashboardPage.titles()).indexOf(top)).toBeGreaterThanOrEqual(openCount);
    await expect(dashboardPage.progressInfo).toContainText(
      `${seededAccount.notes.filter((n) => n.completed).length + 1}/${seededAccount.notes.length}`,
    );
  });

  test('TC-DASH-006 search narrows by title and shows an empty state for no match', async ({ seededAccount, dashboardPage, page }) => {
    await dashboardPage.openAs(seededAccount.token);

    await dashboardPage.search('dentist');
    await expect(dashboardPage.noteTitles).toHaveText(['Book dentist appointment']);

    await dashboardPage.search('zz-no-such-note');
    await expect(dashboardPage.noteCards).toHaveCount(0);
    await expect(page.getByText(/Couldn't find any notes/i)).toBeVisible();
  });

  test('TC-DASH-007 after logout the dashboard and its data are not reachable by URL', async ({
    seededAccount,
    dashboardPage,
    landingPage,
    page,
  }) => {
    await dashboardPage.openAs(seededAccount.token);
    await dashboardPage.logout();
    await expect(landingPage.heading).toBeVisible();

    // Hiding a link is not access control — go straight to the URL.
    await dashboardPage.goto();
    await expect(landingPage.heading).toBeVisible();
    await expect(dashboardPage.addNoteButton).toHaveCount(0);
    await expect(dashboardPage.noteCards).toHaveCount(0);
    await expect(page.getByText(seededAccount.notes[0].title)).toHaveCount(0);
  });

  test("TC-DASH-008 a user cannot open another user's note by direct URL", async ({
    seededAccount: owner,
    account: intruder,
    dashboardPage,
    notePage,
    page,
  }) => {
    const target = owner.notes[0];
    await dashboardPage.openAs(intruder.token);

    await notePage.goto(target.id);

    await expect(notePage.notFound).toBeVisible();
    await expect(page.getByText(target.title)).toHaveCount(0);
    await expect(page.getByText(target.description)).toHaveCount(0);
  });
});
