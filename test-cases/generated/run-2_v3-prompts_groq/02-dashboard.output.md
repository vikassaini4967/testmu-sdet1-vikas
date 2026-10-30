```gherkin
Feature: DASHBOARD module regression suite
  This feature validates that the notes dashboard loads correctly, displays accurate data,
  respects filtering, behaves predictably when notes change, remains usable on small screens,
  and enforces access boundaries between users and logged‑out visitors.

  @positive @smoke @validation
  Scenario: TC-DASH-001 Widget loading on first visit
    Given I register a new user via POST /users/register with unique email "<uid>@example.com", name "Dash User", password "Pass1234"
    And I log in via the UI using those credentials
    When I navigate to https://practice.expandtesting.com/notes/app/
    Then the element with test id "add-new-note" should be visible
    And the element with test id "progress-info" should contain a non‑empty string
    And at least one element with test id "note-card" should be present (even if zero notes, the container exists)

  @positive @validation @session
  Scenario: TC-DASH-002 Data accuracy against API source of truth
    Given I register a new user via POST /users/register with unique email "<uid>@example.com", name "Dash User", password "Pass1234"
    And I obtain a token by logging in via POST /users/login
    And I create three notes via POST /notes with the token:
      | title            | description            | category |
      | "Alpha Note"     | "First note body"      | Home     |
      | "Beta Note"      | "Second note body"     | Work     |
      | "Gamma Note"     | "Third note body"      | Personal |
    When I navigate to https://practice.expandtesting.com/notes/app/ with the token stored in localStorage
    Then the UI must display three note‑cards
    And for each note‑card the title text must match the title returned in the GET /notes response
    And for each note‑card the description text must match the description returned in the GET /notes response
    And for each note‑card the category label must match the category returned in the GET /notes response

  @positive @validation
  Scenario Outline: TC-DASH-003 Category filter shows correct subset
    Given I register a new user via POST /users/register with unique email "<uid>@example.com", name "Dash User", password "Pass1234"
    And I obtain a token by logging in via POST /users/login
    And I create the following notes via POST /notes with that token:
      | title        | description | category |
      | "Home One"   | "body"      | Home     |
      | "Work One"   | "body"      | Work     |
      | "Personal A" | "body"      | Personal |
      | "Home Two"   | "body"      | Home     |
    When I navigate to the dashboard with the token in localStorage
    And I click the button with test id "category-<category>"
    Then the UI must display only note‑cards whose category equals "<category>"
    And the count of displayed note‑cards must equal the number of notes returned by GET /notes filtered by category "<category>"
    And no note‑card belonging to a different category is present

    Examples:
      | category |
      | Home     |
      | Work     |
      | Personal |

  @negative @validation
  Scenario: TC-DASH-004 Filter yields no results and shows empty state
    Given I register a new user via POST /users/register with unique email "<uid>@example.com", name "Dash User", password "Pass1234"
    And I obtain a token by logging in via POST /users/login
    And I create a single note via POST /notes with title "Solo", description "only note", category "Home"
    When I navigate to the dashboard with that token
    And I click the button with test id "category-Work"
    Then the element with test id "note-card" should NOT be present
    And an element with test id "alert-message" should contain a message indicating no notes are available (e.g., "No notes found")

  @positive @validation @security
  Scenario: TC-DASH-005 Assumed ordering – newest notes appear first
    @assumption
    # Assume the dashboard lists notes in descending order of created_at (newest on top).
    Given I register a new user via POST /users/register with unique email "<uid>@example.com", name "Dash User", password "Pass1234"
    And I obtain a token by logging in via POST /users/login
    And I create note A via POST /notes with title "First", description "old", category "Home"
    And I wait 1 second
    And I create note B via POST /notes with title "Second", description "newer", category "Home"
    When I navigate to the dashboard with that token
    Then the first note‑card (topmost) must display title "Second"
    And the second note‑card must display title "First"

  @positive @validation @responsive
  Scenario: TC-DASH-006 Responsive layout on narrow viewport
    Given I register a new user via POST /users/register with unique email "<uid>@example.com", name "Dash User", password "Pass1234"
    And I log in via the UI and store the token
    When I set the browser viewport width to 320 pixels (mobile width)
    And I navigate to https://practice.expandtesting.com/notes/app/
    Then no horizontal scrollbars should appear
    And the button with test id "add-new-note" must be fully visible and clickable
    And each note‑card must fit within the viewport without truncating the title text

  @negative @validation @security
  Scenario: TC-DASH-007 Logged‑out visitor cannot access dashboard widgets
    Given I have no authentication token stored in localStorage
    When I navigate to https://practice.expandtesting.com/notes/app/
    Then the browser URL should be exactly "https://practice.expandtesting.com/notes/app/"
    And the public landing text "Welcome to Notes App" must be visible
    And the element with test id "add-new-note" must NOT be present
    And the element with test id "note-card" must NOT be present

  @negative @validation @security
  Scenario: TC-DASH-008 Different user cannot view another user's notes via API
    Given I register user A via POST /users/register with email "a-<uid>@example.com", name "User A", password "Pass1234"
    And I register user B via POST /users/register with email "b-<uid>@example.com", name "User B", password "Pass5678"
    And I obtain tokenA by logging in as User A
    And I obtain tokenB by logging in as User B
    And I create a note for User A via POST /notes with tokenA, title "A's Note", description "private", category "Work"
    When I send GET /notes with header x-auth-token set to tokenB
    Then the response should have status 200
    And the returned notes array must NOT contain a note with title "A's Note"

  @positive @validation
  Scenario: TC-DASH-009 Progress widget reflects completed notes accurately
    Given I register a new user via POST /users/register with unique email "<uid>@example.com", name "Dash User", password "Pass1234"
    And I obtain a token by logging in via POST /users/login
    And I create four notes via POST /notes with that token, all category "Home"
    And I mark two of those notes as completed via PATCH /notes/:id setting "completed": true
    When I navigate to the dashboard with that token
    Then the element with test id "progress-info" must contain exactly "You have 2/4 notes completed in the all categories"

```
