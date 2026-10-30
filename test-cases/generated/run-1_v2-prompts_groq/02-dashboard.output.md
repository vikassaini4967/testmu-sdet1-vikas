```gherkin
Feature: DASHBOARD module regression suite
  As a release‑gating SDET
  I want to verify that the dashboard displays notes correctly, respects filters, remains usable on different viewports, and does not expose data to unauthorized users.

  @positive @smoke @validation
  Scenario: TC-DASH-001 Widget loading on fresh login
    Given a new user is registered via POST /users/register with:
      | name     | email                 | password |
      | DashUser | widget_load@test.com  | Load1234 |
    And the user logs in successfully (as in TC-LOGIN-001) and obtains token "<token>"
    When the user navigates to https://practice.expandtesting.com/notes/app/
    Then a network request to GET https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<token>" should have responded with status 200
    And the element with test id "progress-info" should be visible
    And at least one element with test id "note-card" should be present within 2 seconds

  @positive @validation @session
  Scenario: TC-DASH-002 Data accuracy – UI matches API source of truth
    Given a new user is registered via POST /users/register with:
      | name     | email               | password |
      | DashUser | data_match@test.com | Data1234 |
    And the user logs in and obtains token "<token>"
    And the user creates three notes via POST https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<token>":
      | title          | description          | category |
      | Alpha Note     | First note body      | Home     |
      | Beta Note      | Second note body     | Work     |
      | Gamma Note     | Third note body      | Personal |
    When the user navigates to https://practice.expandtesting.com/notes/app/
    Then a network request to GET https://practice.expandtesting.com/notes/api/notes should have returned a data array of length 3
    And for each note returned by the API, a corresponding UI element with test id "note-card" must exist containing:
      | title       | description     | category |
      | Alpha Note  | First note body | Home     |
      | Beta Note   | Second note body| Work     |
      | Gamma Note  | Third note body | Personal |

  @positive @validation @filter
  Scenario Outline: TC-DASH-003 Category filter shows only matching notes
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | DashUser | filter_<category>@test.com | Filter123 |
    And the user logs in and obtains token "<token>"
    And the user creates the following notes via the API (header x-auth-token "<token>"):
      | title        | description | category |
      | Home One     | ...         | Home     |
      | Home Two     | ...         | Home     |
      | Work One     | ...         | Work     |
      | Personal One | ...         | Personal |
    When the user navigates to https://practice.expandtesting.com/notes/app/
    And the user clicks the button with test id "category-<category>"
    Then all visible elements with test id "note-card" must have a child with test id "note-card-category" whose text equals "<category>"
    And the number of visible "note-card" elements should equal the count of notes with category "<category>" returned by GET https://practice.expandtesting.com/notes/api/notes
    And no note with a different category should be present in the UI

    Examples:
      | category |
      | home     |
      | work     |
      | personal |

  @negative @validation @filter
  Scenario: TC-DASH-004 Category filter does not omit notes when switching categories
    # Verify that switching filters refreshes the list correctly (both directions)
    Given a new user is registered via POST /users/register with:
      | name     | email               | password |
      | DashUser | switch_filter@test.com | Switch123 |
    And the user logs in and obtains token "<token>"
    And the user creates notes:
      | title      | description | category |
      | Home A     | ...         | Home     |
      | Work B     | ...         | Work     |
    When the user navigates to https://practice.expandtesting.com/notes/app/
    And the user clicks button "category-work"
    Then only notes with category "Work" are visible
    When the user clicks button "category-home"
    Then only notes with category "Home" are visible
    And the previously hidden "Work B" note is not displayed after the second click

  @positive @validation @sort
  # @assumption: notes are displayed in reverse chronological order (most recent first) based on created_at.
  Scenario: TC-DASH-005 Note order reflects creation time
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | DashUser | sort_order@test.com  | Sort1234 |
    And the user logs in and obtains token "<token>"
    And the user creates note "First" via API with created_at "2024-01-01T10:00:00Z"
    And the user creates note "Second" via API with created_at "2024-01-01T11:00:00Z"
    When the user navigates to https://practice.expandtesting.com/notes/app/
    Then the first visible "note-card" should contain a child with test id "note-card-title" whose text is "Second"
    And the second visible "note-card" should contain a child with test id "note-card-title" whose text is "First"
    When the user updates note "First" via PATCH /notes/:id setting completed = true
    Then the order of the two cards should remain unchanged (still "Second" then "First"), confirming that completion status does not affect sorting

  @positive @responsive @validation
  Scenario: TC-DASH-006 Responsive layout – controls remain usable on narrow viewport
    Given a new user is registered via POST /users/register with:
      | name     | email               | password |
      | DashUser | responsive@test.com | Resp1234 |
    And the user logs in and obtains token "<token>"
    And the user creates a note via API
    When the browser viewport is set to width 320px height 640px
    And the user navigates to https://practice.expandtesting.com/notes/app/
    Then the element with test id "add-new-note" should be visible and clickable without horizontal scrolling
    And the category filter buttons ("category-all", "category-home", "category-work", "category-personal") should each be fully visible within the viewport
    And the search input with test id "search-input" should be usable (clickable and accepts typing)

  @negative @security @validation
  Scenario: TC-DASH-007 Direct URL access denied for logged‑out visitor
    Given no user is logged in
    When the visitor navigates directly to https://practice.expandtesting.com/notes/app/
    Then the browser URL should be exactly "https://practice.expandtesting.com/notes/app/login"
    And no element with test id "note-card" should be present

  @negative @security @validation
  Scenario: TC-DASH-008 Direct URL access denied for another logged‑in user
    Given user A is registered via POST /users/register with:
      | name | email            | password |
      | UserA| usera@test.com   | PassA123 |
    And user B is registered via POST /users/register with:
      | name | email            | password |
      | UserB| userb@test.com   | PassB123 |
    And user A creates a note titled "Secret A" via API
    And user B logs in and obtains token "<tokenB>"
    When user B navigates to https://practice.expandtesting.com/notes/app/
    Then the UI must NOT display any note-card with title "Secret A"
    And a GET https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<tokenB>" should return a data array that does NOT contain the note created by user A

  @positive @validation @session
  Scenario: TC-DASH-009 Widget reflects progress after note completion
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | DashUser | progress@test.com    | Prog1234 |
    And the user logs in and obtains token "<token>"
    And the user creates four notes via API, all with category "Home"
    When the user navigates to https://practice.expandtesting.com/notes/app/
    Then the element with test id "progress-info" should contain text "You have 0/4 notes completed in the all categories"
    When the user toggles the completion switch (test id "toggle-note-switch") on the first note
    Then the element with test id "progress-info" should update to contain text "You have 1/4 notes completed in the all categories"

  @negative @validation @security
  Scenario: TC-DASH-010 Unauthorized API call cannot retrieve notes
    Given a new user is registered via POST /users/register with:
      | name     | email               | password |
      | DashUser | unauthorized@test.com | Unauth123 |
    And the user logs in and obtains token "<token>"
    And the user creates a note via API
    When a GET request is sent to https://practice.expandtesting.com/notes/api/notes without the x-auth-token header
    Then the response status should be 401
    And the response body field "message" should contain "Invalid or revoked token"
```
