```gherkin
Feature: REST API regression suite
  As a release‑gating SDET
  I want to verify that the Notes API enforces authentication, authorisation, correct CRUD behaviour, proper error handling, rate‑limit resilience and full schema validation.

  @positive @validation @auth
  Scenario: TC-API-001 Auth token required for protected endpoints
    Given a new user is registered via POST https://practice.expandtesting.com/notes/api/users/register with body:
      | name     | email               | password |
      | ApiUser  | authtoken@test.com  | Token123 |
    When a GET request is sent to https://practice.expandtesting.com/notes/api/notes without header x-auth-token
    Then the response status should be 401
    And the response body field "message" should contain "Invalid or revoked token"
    And the response status must NOT be 5xx

  @positive @validation @auth
  Scenario: TC-API-002 Token revoked after logout can no longer be used
    Given a new user is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name    | email                | password |
      | ApiUser | logout@test.com      | Logout123 |
    And the user logs in via POST https://practice.expandtesting.com/notes/api/users/login and stores token "<token>"
    When the user sends DELETE https://practice.expandtesting.com/notes/api/users/logout with header x-auth-token "<token>"
    Then the response status should be 200
    When the same token "<token>" is used to GET https://practice.expandtesting.com/notes/api/notes
    Then the response status should be 401
    And the response body field "message" should contain "Invalid or revoked token"
    And no 5xx status was returned in this scenario

  @positive @validation @crud
  Scenario: TC-API-003 Full note lifecycle (create → read → update → delete → confirm 404)
    Given a new user is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name    | email                | password |
      | ApiUser | crudlife@test.com    | Crud1234 |
    And the user logs in and stores token "<token>"
    When the user sends POST https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<token>" and body:
      | title       | description      | category |
      | Life Note   | CRUD lifecycle   | Home     |
    Then the response status should be 200
    And the response body field "data.id" should match the regex "^[0-9a-f]{24}$"
    And the response body field "data.title" should be "Life Note"
    And the response body field "data.category" should be "Home"
    And the response body field "data.completed" should be false
    And the response body field "data.created_at" should match ISO‑8601 datetime format
    And the response body field "data.updated_at" should match ISO‑8601 datetime format
    # READ
    When the user sends GET https://practice.expandtesting.com/notes/api/notes/<data.id> with header x-auth-token "<token>"
    Then the response status should be 200
    And the response body field "data.title" should be "Life Note"
    # UPDATE
    When the user sends PATCH https://practice.expandtesting.com/notes/api/notes/<data.id> with header x-auth-token "<token>" and body:
      | completed |
      | true      |
    Then the response status should be 200
    And the response body field "data.completed" should be true
    And the response body field "data.updated_at" should be later than the original "created_at"
    # DELETE
    When the user sends DELETE https://practice.expandtesting.com/notes/api/notes/<data.id> with header x-auth-token "<token>"
    Then the response status should be 200
    # CONFIRM DELETION
    When the user sends GET https://practice.expandtesting.com/notes/api/notes/<data.id> with header x-auth-token "<token>"
    Then the response status should be 404
    And the response body field "message" should contain "not found"

  @negative @validation @schema
  Scenario Outline: TC-API-004 Note creation schema validation – missing or wrong‑type fields
    Given a new user is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name    | email                | password |
      | ApiUser | schema_<case>@test.com | Schema123 |
    And the user logs in and stores token "<token>"
    When the user sends POST https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<token>" and body:
      | title       | description      | category |
      | <title>     | <description>    | <category> |
    Then the response status should be 400
    And the response body field "message" should contain "<errorField>"
    And the response status must NOT be 5xx

    Examples:
      | case   | title                | description | category | errorField |
      | missingTitle |               | Desc        | Home     | title      |
      | shortTitle   | abc            | Desc        | Home     | title      |
      | missingDesc  | Valid Title    |             | Work     | description|
      | longDesc     | Valid Title    | <256 chars> | Work     | description|
      | invalidCat   | Valid Title    | Valid Desc  | Invalid  | category   |

    # Note: "<256 chars>" represents a string longer than the allowed 1000 characters; the exact length is generated by the test harness.

  @negative @validation @errorhandling
  Scenario: TC-API-005 Access another user's note – authorisation enforced
    Given user A is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name | email            | password |
      | UserA| usera@test.com   | PassA123 |
    And user B is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name | email            | password |
      | UserB| userb@test.com   | PassB123 |
    And user A logs in and stores token "<tokenA>"
    And user B logs in and stores token "<tokenB>"
    And user A creates a note via POST https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<tokenA>" and body:
      | title | description | category |
      | Secret| Private note| Personal |
    When user B attempts to GET https://practice.expandtesting.com/notes/api/notes/<data.id> with header x-auth-token "<tokenB>"
    Then the response status should be 404
    And the response body field "message" should contain "not found"
    When user B attempts to PATCH the same note with header x-auth-token "<tokenB>" and body { "title": "Hacked" }
    Then the response status should be 404
    And no 5xx status was returned in any step of this scenario

  @negative @validation @errorhandling
  Scenario: TC-API-006 Malformed ObjectId returns 400
    Given a new user is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name    | email                | password |
      | ApiUser | malformedid@test.com | BadId123 |
    And the user logs in and stores token "<token>"
    When the user sends GET https://practice.expandtesting.com/notes/api/notes/invalid-object-id with header x-auth-token "<token>"
    Then the response status should be 400
    And the response body field "message" should contain "ObjectId"
    And the response status must NOT be 5xx

  @negative @validation @errorhandling
  Scenario: TC-API-007 Duplicate registration yields 409 and no 5xx
    Given a new user is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name    | email                | password |
      | ApiUser | dupreg@test.com      | Dup12345 |
    When the same registration request is sent again with identical email
    Then the response status should be 409
    And the response body field "message" should contain "duplicate"
    And no 5xx status was observed

  @positive @validation @rate
  Scenario: TC-API-008 Rate‑limit observation – request series does not cause 5xx
    Given a new user is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name    | email                | password |
      | ApiUser | ratelimit@test.com   | Rate1234 |
    And the user logs in and stores token "<token>"
    When the user sends 20 consecutive GET requests to https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<token>"
    Then every response status should be either 200 or 401 or 429
    And no response status should be in the 5xx range
    And the test records the distribution of statuses (e.g., "12×200, 8×429") for review

  @negative @validation @schema
  Scenario: TC-API-009 Note update schema validation – invalid field types
    Given a new user is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name    | email                | password |
      | ApiUser | update_schema@test.com | Upd12345 |
    And the user logs in and stores token "<token>"
    And the user creates a note via POST https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<token>" and body:
      | title | description | category |
      | UpdNote| To be edited| Work |
    When the user sends PATCH https://practice.expandtesting.com/notes/api/notes/<data.id> with header x-auth-token "<token>" and body:
      | completed | category |
      | "yes"     | 123      |
    Then the response status should be 400
    And the response body field "message" should contain "completed"
    And the response body field "message" should contain "category"
    And the response must NOT be 5xx

  @positive @validation @schema
  Scenario: TC-API-010 GET notes list schema verification
    Given a new user is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name    | email                | password |
      | ApiUser | list_schema@test.com | List1234 |
    And the user logs in and stores token "<token>"
    And the user creates two notes via POST https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<token>":
      | title   | description | category |
      | NoteOne | Desc One    | Home     |
      | NoteTwo | Desc Two    | Work     |
    When the user sends GET https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<token>"
    Then the response status should be 200
    And the response body field "data" should be an array of length 2
    And each element in "data" must contain fields:
      | id            | type: string, pattern: "^[0-9a-f]{24}$" |
      | title         | type: string, minLength:4, maxLength:100 |
      | description   | type: string, minLength:4, maxLength:1000 |
      | category      | enum: ["Home","Work","Personal"] |
      | completed     | type: boolean |
      | created_at    | type: string, format: date-time (ISO‑8601) |
      | updated_at    | type: string, format: date-time (ISO‑8601) |
      | user_id       | type: string, pattern: "^[0-9a-f]{24}$" |
    And no 5xx status was returned

  @negative @validation @errorhandling
  Scenario: TC-API-011 Forgot‑password request with unknown email returns 200 (no enumeration) and no 5xx
    Given a new user is registered via POST https://practice.expandtesting.com/notes/api/users/register with:
      | name    | email                | password |
      | ApiUser | forgot_known@test.com | Forgot123 |
    When a POST request is sent to https://practice.expandtesting.com/notes/api/users/forgot-password with body { "email": "nonexistent@test.com" }
    Then the response status should be 200
    And the response body field "message" should contain "If an account with that email exists"
    And the response must NOT be 5xx
```
