```gherkin
Feature: Dashboard module regression suite
  As a release‑gate SDET
  I need deterministic, observable tests that verify all critical dashboard behaviours

  @positive @smoke @validation
  Scenario: TC-DASH-001 Widget loading on first visit
    Given I generate a unique email "<uid>@example.com" and password "LoadPass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Dash User",
        "email": "<uid>@example.com",
        "password": "LoadPass123"
      }
      """
    And I login via UI with those credentials
    When I navigate to https://practice.expandtesting.com/notes/app/
    Then the element with testid "progress-info" should be visible
    And the element with testid "add-new-note" should be visible
    And at least one element with testid "note-card" should be present within 5 seconds

  @positive @validation @session
  Scenario: TC-DASH-002 Data accuracy – UI reflects API note list
    Given I generate a unique email "<uid>@example.com" and password "DataPass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Dash User",
        "email": "<uid>@example.com",
        "password": "DataPass123"
      }
      """
    And I login via UI with those credentials
    # Seed three notes via the API
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """
      { "title": "Note A", "description": "Desc A", "category": "Home" }
      """
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """
      { "title": "Note B", "description": "Desc B", "category": "Work" }
      """
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """
      { "title": "Note C", "description": "Desc C", "category": "Personal" }
      """
    When I refresh the browser
    Then the dashboard should display exactly three note‑cards
    And each displayed note‑card's title and description must match the corresponding note returned by GET /notes for this user

  @positive @validation @filter
  Scenario Outline: TC-DASH-003 Category filter shows correct subset
    Given I generate a unique email "<uid>@example.com" and password "FiltPass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Dash User",
        "email": "<uid>@example.com",
        "password": "FiltPass123"
      }
      """
    And I login via UI with those credentials
    # Seed notes of each category
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """
      { "title": "Home 1", "description": "H1", "category": "Home" }
      """
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """
      { "title": "Work 1", "description": "W1", "category": "Work" }
      """
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """
      { "title": "Personal 1", "description": "P1", "category": "Personal" }
      """
    When I click the button with testid "category-<cat>"
    Then every displayed note‑card must have a category equal to "<cat>"
    And the number of displayed note‑cards must equal the count of notes returned by GET /notes?category=<cat> for this user

    Examples:
      | cat      |
      | home     |
      | work     |
      | personal |

  @positive @validation @sort
  Scenario: TC-DASH-004 Note ordering on completion toggle @assumption
    # Assumption: notes are displayed in creation order, newest first
    Given I generate a unique email "<uid>@example.com" and password "SortPass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Dash User",
        "email": "<uid>@example.com",
        "password": "SortPass123"
      }
      """
    And I login via UI with those credentials
    # Create three notes in known order
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """
      { "title": "First", "description": "1", "category": "Home" }
      """
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """
      { "title": "Second", "description": "2", "category": "Home" }
      """
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """
      { "title": "Third", "description": "3", "category": "Home" }
      """
    When I refresh the browser
    Then the first note‑card in the list should have title "Third"
    And the second note‑card should have title "Second"
    And the third note‑card should have title "First"
    # Now toggle completion on the middle note and verify order stays consistent
    When I click the element with testid "toggle-note-switch" inside the note‑card whose title is "Second"
    Then the order of note‑cards should remain: "Third", "Second", "First"

  @positive @responsive @validation
  Scenario: TC-DASH-005 Responsive layout on narrow viewport
    Given I generate a unique email "<uid>@example.com" and password "RespPass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Dash User",
        "email": "<uid>@example.com",
        "password": "RespPass123"
      }
      """
    And I login via UI with those credentials
    When I set the browser viewport width to 320 pixels
    Then horizontal scrolling should NOT be present on the main dashboard container
    And the category filter buttons should still be clickable and visible
    And the "add-new-note" button should remain fully usable (click triggers note creation dialog)

  @negative @permission @validation
  Scenario: TC-DASH-006 Direct URL access denied for logged‑out visitor
    When I navigate to https://practice.expandtesting.com/notes/app/
    Then the URL should be exactly https://practice.expandtesting.com/notes/app/login
    And no element with testid "note-card" should be present
    And a toast with testid "alert-message" should contain the word "login"

  @negative @permission @validation
  Scenario: TC-DASH-007 Direct URL access denied for a different logged‑in user
    # User A creates a note; User B must not see it by URL manipulation
    Given I generate a unique email "a-<uid>@example.com" and password "UserAPass123"
    And I register User A via POST /users/register with body:
      """
      {
        "name": "User A",
        "email": "a-<uid>@example.com",
        "password": "UserAPass123"
      }
      """
    And I login via UI as User A
    And I create note via POST /notes with header x-auth-token set to User A token and body:
      """
      { "title": "Secret", "description": "Only A", "category": "Work" }
      """
    And I capture the note id returned as "noteIdA"
    And I log out via DELETE /users/logout with header x-auth-token set to User A token
    # Register and login as User B
    And I generate a unique email "b-<uid>@example.com" and password "UserBPass123"
    And I register User B via POST /users/register with body:
      """
      {
        "name": "User B",
        "email": "b-<uid>@example.com",
        "password": "UserBPass123"
      }
      """
    And I login via UI as User B
    When I navigate directly to https://practice.expandtesting.com/notes/app/notes/<noteIdA>
    Then the response status of the GET request should be 404
    And the UI should display a toast with testid "alert-message" containing "not found"

  @positive @validation @session
  Scenario: TC-DASH-008 Progress widget reflects completed notes
    Given I generate a unique email "<uid>@example.com" and password "ProgPass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Dash User",
        "email": "<uid>@example.com",
        "password": "ProgPass123"
      }
      """
    And I login via UI with those credentials
    # Seed four notes, mark two as completed via API
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """{ "title": "N1", "description": "D1", "category": "Home" }"""
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """{ "title": "N2", "description": "D2", "category": "Home" }"""
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """{ "title": "N3", "description": "D3", "category": "Home" }"""
    And I create note via POST /notes with header x-auth-token set to the UI token and body:
      """{ "title": "N4", "description": "D4", "category": "Home" }"""
    And I mark notes N2 and N4 as completed via PATCH /notes/:id with { "completed": true }
    When I refresh the browser
    Then the element with testid "progress-info" should contain exactly "You have 2/4 notes completed in the all categories"

  @negative @validation @security
  Scenario: TC-DASH-009 Client‑side protection – note creation UI hidden when token missing
    When I clear localStorage key "token"
    And I navigate to https://practice.expandtesting.com/notes/app/
    Then the element with testid "add-new-note" should NOT be present
    And the URL should be exactly https://practice.expandtesting.com/notes/app/login
```
