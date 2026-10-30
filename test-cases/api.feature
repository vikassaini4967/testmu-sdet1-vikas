# Module: REST API (Notes API)
# Curated from LLM-generated cases (prompts.md), then corrected against the live API on 2026-10-30.
# Automated in tests/api/notes-api.spec.ts — IDs map 1:1 (npm run check:trace).

Feature: Notes REST API
  As a client of the Notes API
  I want auth, CRUD, errors and limits to behave to contract
  So that integrators can rely on it

  # Every scenario registers its own users and deletes them afterwards.

  @positive @smoke
  Scenario: TC-API-001 Health check reports the service up
    When I GET /health-check
    Then the status is 200
    And the body matches the envelope schema with success = true

  @positive @auth @schema
  Scenario: TC-API-002 Register, login and profile return schema-valid bodies with a usable token
    When I POST /users/register with a unique user
    Then the status is 201 and data has an ObjectId id, the name and a valid email
    When I POST /users/login with those credentials
    Then the status is 200 and data.token is a string of at least 10 characters
    When I GET /users/profile with x-auth-token set to that token
    Then data equals the registered id, name and email

  @negative @auth @security
  Scenario: TC-API-003 Wrong password and unknown email get the identical 401 with no token
    When I log in with a wrong password for an existing user
    And I log in with an email that was never registered
    Then both responses are 401 and match the strict error schema (no data, no token)
    And both messages are identical

  @negative @auth
  Scenario: TC-API-004 A protected route rejects a missing token with 401
    When I GET /notes without an x-auth-token header
    Then the status is 401 and the message names the x-auth-token header

  @negative @auth @security
  Scenario Outline: TC-API-005 A malformed token is rejected with 401, not a 5xx
    When I GET /notes with x-auth-token "<token>"
    Then the status is 401 and the body matches the error schema

    Examples:
      | token                 |
      | not-a-real-token      |
      | 64 × "a"              |
      | ' OR '1'='1           |

  @positive @crud @schema
  Scenario: TC-API-006 Note CRUD lifecycle, ending with proof the delete really deleted
    Given I am authenticated
    When I POST /notes with a valid title, description and category
    Then the status is 200 and the body matches the note schema (ObjectIds, ISO timestamps, category enum)
    And GET /notes/:id returns the identical note, and GET /notes lists only it
    When I PUT the note with a new title, category and completed = true
    Then those fields change and updated_at advances
    When I PATCH completed = false
    Then completed is false
    When I DELETE the note
    Then the status is 200, GET /notes/:id returns 404 and GET /notes is empty

  @negative @validation
  Scenario Outline: TC-API-007 Invalid note input is rejected with 400 and a field-level message, and nothing is stored
    Given I am authenticated
    When I POST /notes with <invalid input>
    Then the status is 400 and the message names the <field>
    And GET /notes is still empty

    Examples:
      | invalid input              | field       |
      | a 2-character title        | title       |
      | a 101-character title      | title       |
      | category "Garden"          | category    |
      | a 1001-character description | description |

  @negative @error-handling
  Scenario: TC-API-008 An unknown note id is 404 and a malformed id is 400 — never 5xx
    Given I am authenticated
    When I GET /notes/000000000000000000000000
    Then the status is 404 with the error schema
    When I GET /notes/not-an-id, /notes/%25%25%25 and /notes/1
    Then each status is 400

  @negative @security @authorization
  Scenario: TC-API-009 A user cannot read, change or delete another user's note
    Given user A has created a note
    And user B is authenticated
    When user B tries to GET, PUT, PATCH and DELETE that note by id
    Then every response is 401, 403 or 404
    And user A's note is unchanged

  # Rate limiting is undocumented. Passing under either behaviour is deliberate;
  # which behaviour was seen is recorded as an annotation.
  @negative @rate-limiting
  Scenario: TC-API-010 A burst of requests is throttled or handled — never 5xx
    When I send 25 concurrent POST /users/login requests with bad credentials
    Then no response is 5xx
    And every response is 401 or 429
    And the run records whether any 429 was seen

  @negative @auth @session
  Scenario: TC-API-011 Logout revokes the token server-side
    Given I am authenticated and GET /notes returns 200
    When I DELETE /users/logout
    Then the same token gets 401 on GET /notes

  @negative @error-handling @schema
  Scenario: TC-API-012 Validation errors share one error envelope with no internals leaked
    When I send a note with no title, an invalid completed value, a registration with a bad email, and a request to an unknown route
    Then every status is 4xx
    And every body matches the strict error schema { success: false, status, message }
    And no body contains a stack trace or file path

  # KNOWN-BUG-003 — automated as test.fail(); flips red the day it is fixed.
  @negative @error-handling @schema @known-bug
  Scenario: TC-API-013 A malformed JSON body gets the same error envelope as any other 400
    Given I am authenticated
    When I POST /notes with the body '{"title": "Broken'
    Then the status is 400
    And the body matches the strict error schema, including "status"
