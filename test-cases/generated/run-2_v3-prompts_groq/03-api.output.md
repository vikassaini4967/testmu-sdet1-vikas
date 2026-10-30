```gherkin
Feature: REST API regression suite – Notes practice app
  # The API base URL is https://practice.expandtesting.com/notes/api
  # All requests use the header x-auth-token: <token> where required.
  # Each scenario creates its own user (and notes) and cleans up afterwards.

  @positive @security @auth
  Scenario: TC-API-001 – Valid token allows access to protected endpoint
    Given a user is registered via POST /users/register with unique email "<uid1>@example.com" and password "Pwd12345"
    And the user logs in via POST /users/login and extracts the token as "authToken"
    When a GET request is sent to /users/profile with header x-auth-token = "authToken"
    Then the response status is 200
    And the response envelope field "success" is true
    And the response envelope field "data.email" equals "<uid1>@example.com"

  @negative @security @auth
  Scenario: TC-API-002 – Revoked token is rejected
    Given a user is registered via POST /users/register with unique email "<uid2>@example.com" and password "Pwd12345"
    And the user logs in via POST /users/login and extracts the token as "authToken"
    When a DELETE request is sent to /users/logout with header x-auth-token = "authToken"
    Then the response status is 200
    When a GET request is sent to /users/profile with header x-auth-token = "authToken"
    Then the response status is 401
    And the response envelope field "message" contains "invalid"  

  @negative @auth @validation
  Scenario: TC-API-003 – Missing token yields 401
    When a GET request is sent to /users/profile without x-auth-token header
    Then the response status is 401
    And the response envelope field "message" is present

  @positive @crud @auth
  Scenario: TC-API-004 – Full CRUD lifecycle for a note
    # Create user and obtain token
    Given a user is registered via POST /users/register with unique email "<uid3>@example.com" and password "Pwd12345"
    And the user logs in via POST /users/login and extracts the token as "authToken"
    # Create note
    When a POST request is sent to /notes with header x-auth-token = "authToken" and body:
      """
      {
        "title": "Note A",
        "description": "First note description",
        "category": "Home"
      }
      """
    Then the response status is 200
    And the response envelope field "success" is true
    And the response envelope field "data.id" matches the regex "^[0-9a-f]{24}$"
    And the response envelope field "data.title" equals "Note A"
    And the response envelope field "data.completed" is false
    And the response envelope field "data.created_at" matches ISO-8601 datetime
    # Read note
    When a GET request is sent to /notes/<data.id> with header x-auth-token = "authToken"
    Then the response status is 200
    And the response envelope field "data.title" equals "Note A"
    # Update note (toggle completed)
    When a PATCH request is sent to /notes/<data.id> with header x-auth-token = "authToken" and body:
      """
      { "completed": true }
      """
    Then the response status is 200
    And the response envelope field "data.completed" is true
    # Delete note
    When a DELETE request is sent to /notes/<data.id> with header x-auth-token = "authToken"
    Then the response status is 200
    # Verify deletion
    When a GET request is sent to /notes/<data.id> with header x-auth-token = "authToken"
    Then the response status is 404
    And the response envelope field "message" is present

  @negative @validation @crud
  Scenario: TC-API-005 – Creating a note with invalid fields returns 400 and no 5xx
    Given a user is registered via POST /users/register with unique email "<uid4>@example.com" and password "Pwd12345"
    And the user logs in via POST /users/login and extracts the token as "authToken"
    When a POST request is sent to /notes with header x-auth-token = "authToken" and body:
      """
      {
        "title": "No",                         # too short (<4)
        "description": "",                     # too short (<4)
        "category": "InvalidCategory"          # not an allowed enum
      }
      """
    Then the response status is 400
    And the response envelope field "message" contains "title"
    And the response envelope field "message" contains "description"
    And the response envelope field "message" contains "category"
    And the response envelope does NOT contain a field "data"

  @negative @validation @auth
  Scenario: TC-API-006 – Accessing another user's note is unauthorized
    # User A creates a note
    Given a user "A" is registered via POST /users/register with unique email "<uid5a>@example.com" and password "Pwd12345"
    And user "A" logs in via POST /users/login and extracts token as "tokenA"
    When a POST request is sent to /notes with header x-auth-token = "tokenA" and body:
      """
      {
        "title": "User A note",
        "description": "Secret",
        "category": "Work"
      }
      """
    Then the response status is 200
    And the response envelope field "data.id" is saved as "noteIdA"
    # User B attempts to read it
    Given a user "B" is registered via POST /users/register with unique email "<uid5b>@example.com" and password "Pwd12345"
    And user "B" logs in via POST /users/login and extracts token as "tokenB"
    When a GET request is sent to /notes/<noteIdA> with header x-auth-token = "tokenB"
    Then the response status is 403
    And the response envelope field "message" contains "unauthorized"
    # User B attempts to update it
    When a PATCH request is sent to /notes/<noteIdA> with header x-auth-token = "tokenB" and body:
      """{ "title": "Hacked" }"""
    Then the response status is 403
    # User B attempts to delete it
    When a DELETE request is sent to /notes/<noteIdA> with header x-auth-token = "tokenB"
    Then the response status is 403

  @negative @security @validation
  Scenario: TC-API-007 – API does not disclose user existence via login error (enumeration check)
    # Register a known user
    Given a user is registered via POST /users/register with unique email "<uid6>@example.com" and password "Pwd12345"
    When a POST request is sent to /users/login with body:
      """
      { "email": "<uid6>@example.com", "password": "WrongPass" }
      """
    Then the response status is 401
    And the response envelope field "message" equals "Incorrect email address or password"
    When a POST request is sent to /users/login with body:
      """
      { "email": "nonexistent_<uid6>@example.com", "password": "AnyPass" }
      """
    Then the response status is 401
    And the response envelope field "message" equals "Incorrect email address or password"

  @negative @validation @auth
  Scenario: TC-API-008 – Malformed ObjectId returns 400, not 5xx
    Given a user is registered via POST /users/register with unique email "<uid7>@example.com" and password "Pwd12345"
    And the user logs in via POST /users/login and extracts the token as "authToken"
    When a GET request is sent to /notes/invalid-object-id with header x-auth-token = "authToken"
    Then the response status is 400
    And the response envelope field "message" contains "ObjectId"

  @negative @security @auth
  Scenario: TC-API-009 – Access with a token that has been logged out is rejected
    Given a user is registered via POST /users/register with unique email "<uid8>@example.com" and password "Pwd12345"
    And the user logs in via POST /users/login and extracts the token as "authToken"
    When a DELETE request is sent to /users/logout with header x-auth-token = "authToken"
    Then the response status is 200
    When a GET request is sent to /notes with header x-auth-token = "authToken"
    Then the response status is 401
    And the response envelope field "message" contains "invalid"

  @negative @rate @security
  Scenario: TC-API-010 – Repeated rapid requests do not produce 5xx
    # @assumption: The server may enforce undocumented rate limiting but will return 429 or 200, never 5xx.
    Given a user is registered via POST /users/register with unique email "<uid9>@example.com" and password "Pwd12345"
    And the user logs in via POST /users/login and extracts the token as "authToken"
    When 15 GET requests are sent in quick succession to /notes with header x-auth-token = "authToken"
    Then for each response the status is either 200 or 429
    And no response has a status code in the 5xx range
    And the response envelope field "message" is present for every response

  @positive @validation @schema
  Scenario: TC-API-011 – Successful note creation returns full schema
    Given a user is registered via POST /users/register with unique email "<uid10>@example.com" and password "Pwd12345"
    And the user logs in via POST /users/login and extracts the token as "authToken"
    When a POST request is sent to /notes with header x-auth-token = "authToken" and body:
      """
      {
        "title": "Schema Test",
        "description": "Validate all fields",
        "category": "Personal"
      }
      """
    Then the response status is 200
    And the response envelope field "data.id" matches the regex "^[0-9a-f]{24}$"
    And the response envelope field "data.title" is a string of length 4‑100
    And the response envelope field "data.description" is a string of length 4‑1000
    And the response envelope field "data.category" equals "Personal"
    And the response envelope field "data.completed" is a boolean
    And the response envelope field "data.created_at" matches ISO‑8601 datetime
    And the response envelope field "data.updated_at" matches ISO‑8601 datetime
    And the response envelope field "data.user_id" matches the regex "^[0-9a-f]{24}$"
```
