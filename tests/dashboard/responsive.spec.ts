import { test, expect } from '../../src/fixtures/ui-fixture.js';

/**
 * DASHBOARD, responsive — TC-DASH-009 … 010. Runs only in the
 * `mobile-chrome` project (Pixel 7, 412×839), see playwright.config.ts.
 *
 * Assertions are on behaviour a user feels (are the controls usable? is the
 * page wider than the screen?), not on pixel widths that break on any CSS tweak.
 */

test.describe('Dashboard — phone viewport', () => {
  test('TC-DASH-009 primary note controls are usable on a phone', async ({ seededAccount, dashboardPage }) => {
    await dashboardPage.openAs(seededAccount.token);

    await expect(dashboardPage.addNoteButton).toBeInViewport();
    await expect(dashboardPage.searchInput).toBeEditable();
    await expect(dashboardPage.noteCards).toHaveCount(seededAccount.notes.length);

    await dashboardPage.filterBy('Work');
    expect((await dashboardPage.titles()).sort()).toEqual(
      seededAccount.notes.filter((n) => n.category === 'Work').map((n) => n.title).sort(),
    );
  });

  test('TC-DASH-010 nothing requires horizontal scrolling on a phone', async ({ seededAccount, dashboardPage, page }) => {
    test.info().annotations.push({
      type: 'issue',
      description:
        'KNOWN-BUG-001: the site layout wrapper div#core renders 500px wide in a 412px viewport, so every Notes page is wider than a phone screen (scrollWidth 502 vs clientWidth 412).',
    });
    test.fail();

    await dashboardPage.openAs(seededAccount.token);
    await expect(dashboardPage.noteCards.first()).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `horizontal overflow: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth);
  });
});
