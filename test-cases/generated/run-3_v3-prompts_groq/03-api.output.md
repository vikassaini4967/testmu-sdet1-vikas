```gherkin
Feature: REST API regression suite for ExpandTesting Notes app
  As a senior SDET I need deterministic API tests that gate releases.
  All scenarios create and clean up their own users and notes.

  @positive @smoke @auth @validation
  Scenario TC-API-001: Valid token allows access to protected endpoints
    Given I register a new user via POST /users/register with unique email "<uuid>@example.com" and password "Passw0rd!"
    And I log in via POST /users/login with that email and password
    Then the response status is 200
    And the response envelope contains data.token
    When I GET /users/profile with header x-auth-token set to the returned token
    Then the response status is 200
    And the response envelope contains data.email equal to the registered email

  @negative @auth @security
  Scenario TC-API-002: Invalid token is rejected
    Given I have an invalid token "invalid.token.value"
    When I GET /users/profile with header x-auth-token set to the invalid token
    Then the response status is 401
    And the response envelope contains a message

  @negative @auth @session
  Scenario TC-API-003: Revoked token after logout cannot be used
    Given I register a new user via POST /users/register with unique email "<uuid>@example.com" and password "Passw0rd!"
    And I log in via POST /users/login and capture token "<token>"
    When I DELETE /users/logout with header x-auth-token set to "<token>"
    Then the response status is 200
    When I GET /users/profile with header x-auth-token set to "<token>"
    Then the response status is 401
    And the response envelope contains a message

  @positive @crud @validation
  Scenario TC-API-004: Full note lifecycle (create, read, update, delete)
    Given I register and log in a user, capturing token "<t>"
    And I POST a new note to /notes with header x-auth-token "<t>" and body:
      """
      {
        "title": "Note A",
        "description": "First note description",
        "category": "Home"
      }
      """
    Then the response status is 200
    And the response envelope contains data.id matching /^[0-9a-f]{24}$/
    And the response envelope data includes fields:
      | id          | string |
      | title       | string |
      | description | string |
      | category    | enum[Home,Work,Personal] |
      | completed   | boolean |
      | created_at  | iso8601 |
      | updated_at  | iso8601 |
      | user_id     | string |
    When I GET /notes/:id using the returned id with header x-auth-token "<t>"
    Then the response status is 200
    And the response envelope data.title is "Note A"
    When I PATCH /notes/:id with header x-auth-token "<t>" and body:
      """
      { "completed": true }
      """
    Then the response status is 200
    And the response envelope data.completed is true
    When I DELETE /notes/:id with header x-auth-token "<t>"
    Then the response status is 200
    When I GET /notes/:id with header x-auth-token "<t>"
    Then the response status is 404
    And the response envelope contains a message

  @negative @validation @errorhandling
  Scenario TC-API-005: Creating a note with missing required fields returns 400
    Given I register and log in a user, capturing token "<t>"
    When I POST to /notes with header x-auth-token "<t>" and body:
      """
      { "title": "A", "description": "B" }
      """
    Then the response status is 400
    And the response envelope contains a message naming the missing field "category"
    And the response envelope does not contain a 5xx status

  @negative @validation @errorhandling
  Scenario TC-API-006: Creating a note with invalid field types returns 400
    Given I register and log in a user, capturing token "<t>"
    When I POST to /notes with header x-auth-token "<t>" and body:
      """
      {
        "title": 12345,
        "description": true,
        "category": "InvalidCategory"
      }
      """
    Then the response status is 400
    And the response envelope contains a message naming the first invalid field "title"
    And the response envelope does not contain a 5xx status

  @negative @auth @security
  Scenario TC-API-007: User B cannot read User A's note
    Given I register and log in User A, capturing token "<tA>"
    And I register and log in User B, capturing token "<tB>"
    And User A creates a note via POST /notes with token "<tA>" and title "Secret"
    When User B GETs /notes/:id of that note with token "<tB>"
    Then the response status is 403
    And the response envelope contains a message

  @negative @auth @security
  Scenario TC-API-008: User B cannot update User A's note
    Given I register and log in User A, capturing token "<tA>"
    And I register and log in User B, capturing token "<tB>"
    And User A creates a note via POST /notes with token "<tA>" and title "Secret"
    When User B PATCHes /notes/:id of that note with token "<tB>" and body "{ \"title\": \"Hacked\" }"
    Then the response status is 403
    And the response envelope contains a message

  @negative @auth @security
  Scenario TC-API-009: User B cannot delete User A's note
    Given I register and log in User A, capturing token "<tA>"
    And I register and log in User B, capturing token "<tB>"
    And User A creates a note via POST /notes with token "<tA>" and title "Secret"
    When User B DELETEs /notes/:id of that note with token "<tB>"
    Then the response status is 403
    And the response envelope contains a message

  @negative @ratelimit @performance
  Scenario TC-API-010: Repeated rapid requests do not cause 5xx errors
    Given I register and log in a user, capturing token "<t>"
    When I repeat 20 times quickly:
      """
      GET /notes with header x-auth-token "<t>"
      """
    Then each response has status code in [200,429,401,403]
    And no response has a status code 5xx
    # Record observed statuses in test logs for analysis

  @negative @validation @errorhandling
  Scenario TC-API-011: Malformed ObjectId returns 400
    Given I register and log in a user, capturing token "<t>"
    When I GET /notes/invalid-id with header x-auth-token "<t>"
    Then the response status is 400
    And the response envelope contains a message mentioning "ObjectId"

  @negative @validation @errorhandling
  Scenario TC-API-012: Unknown note id returns 404
    Given I register and log in a user, capturing token "<t>"
    And I have a valid ObjectId "507f1f77bcf86cd799439011" that does not belong to any note
    When I GET /notes/507f1f77bcf86cd799439011 with header x-auth-token "<t>"
    Then the response status is 404
    And the response envelope contains a message

  @negative @auth @validation
  Scenario TC-API-013: Missing auth header results in 401
    Given I have a valid note id "<noteId>" created by a logged‑in user
    When I GET /notes/<noteId> without x-auth-token header
    Then the response status is 401
    And the response envelope contains a message
```
