# Module: Dashboard
# Curated from LLM-generated cases (prompts.md), then corrected against the live app on 2026-10-30.
# Automated in tests/dashboard/dashboard.spec.ts and responsive.spec.ts — IDs map 1:1 (npm run check:trace).

Feature: Dashboard
  As a logged-in user
  I want my notes dashboard to load, filter and order notes correctly
  So that what I see is exactly what is stored — and only mine

  Background:
    Given a fresh user seeded through the API with 4 notes:
      | title                    | category | completed |
      | Pay electricity bill     | Home     | no        |
      | Prepare sprint demo      | Work     | no        |
      | Book dentist appointment | Personal | no        |
      | Review regression report | Work     | yes       |
    And I open the dashboard as that user

  @positive @smoke
  Scenario: TC-DASH-001 Widgets finish loading with no first-party errors
    Then 4 note cards are shown
    And the All, Home, Work and Personal filter buttons are visible
    And add-note is enabled, search is editable and the progress counter is visible
    And there are no first-party console errors and no failed API calls

  @positive @data-accuracy
  Scenario: TC-DASH-002 Rendered notes and progress counter match the API response
    When the app's own GET /notes response is captured
    Then it contains exactly the seeded notes
    And the rendered card titles equal the titles in that response
    And the progress counter reads "1/4 notes completed in the all categories"

  @positive @filter
  Scenario Outline: TC-DASH-003 Category filter shows exactly that category's notes
    When I filter by "<category>"
    Then the visible titles are exactly the seeded "<category>" notes — none missing, none extra
    And the progress counter is scoped to the "<category>" category with the matching counts

    Examples:
      | category |
      | Home     |
      | Work     |
      | Personal |

  @positive @filter
  Scenario: TC-DASH-004 Returning to "All" restores the original list in the original order
    Given I note the visible titles in order
    When I filter by "Personal" and then by "All"
    Then the visible titles are identical, in the same order

  # Ordering rule observed on the live app (there is no sort control):
  # open notes first, then completed; most recently updated first within each.
  @positive @sort
  Scenario: TC-DASH-005 Open notes come first by latest update; completing a note moves it down
    Then the cards are in the order derived from the seeded data by that rule
    When I mark the top note as completed
    Then it moves below every open note
    And the progress counter increases by one

  @positive @search
  Scenario: TC-DASH-006 Search narrows by title and shows an empty state for no match
    When I search for "dentist"
    Then only "Book dentist appointment" is shown
    When I search for "zz-no-such-note"
    Then no cards are shown and a "Couldn't find any notes" message appears

  @negative @security @permissions
  Scenario: TC-DASH-007 After logout the dashboard and its data are not reachable by URL
    When I log out
    Then the public "Welcome to Notes App" landing page is shown
    When I navigate directly to the dashboard URL
    Then the landing page is still shown
    And no note cards, no add-note button and no seeded titles are rendered

  @negative @security @permissions
  Scenario: TC-DASH-008 A user cannot open another user's note by direct URL
    Given a second, unrelated user is logged in
    When they open the first user's note at /notes/app/notes/<id>
    Then "No note found with the provided ID" is shown
    And neither the note's title nor its description is rendered

  @positive @responsive
  Scenario: TC-DASH-009 Primary note controls are usable on a phone
    Given a Pixel 7 viewport (412 × 839)
    Then add-note is in the viewport and search is editable
    And all 4 note cards are shown
    When I filter by "Work"
    Then exactly the seeded Work notes are shown

  # KNOWN-BUG-001 — automated as test.fail(); flips red the day it is fixed.
  @negative @responsive @known-bug
  Scenario: TC-DASH-010 Nothing requires horizontal scrolling on a phone
    Given a Pixel 7 viewport (412 × 839)
    Then the document is no wider than the viewport
