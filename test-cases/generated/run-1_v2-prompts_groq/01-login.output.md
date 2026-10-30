```gherkin
Feature: LOGIN module regression suite
  As a release‑gating SDET
  I want to verify all critical behaviours of the login flow
  So that no defect can ship unnoticed.

  @positive @smoke @validation
  Scenario: TC-LOGIN-001 Valid login
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | TestUser | valid_user@test.com  | Passw0rd |
    When the user navigates to https://practice.expandtesting.com/notes/app/login
    And the user enters "valid_user@test.com" into the element with test id "login-email"
    And the user enters "Passw0rd" into the element with test id "login-password"
    And the user clicks the element with test id "login-submit"
    Then the browser URL should be exactly "https://practice.expandtesting.com/notes/app/"
    And localStorage should contain key "token" with a non‑empty string value
    And a network request to POST https://practice.expandtesting.com/notes/api/users/login should have responded with status 200
    And the response body field "data.token" should equal the value stored in localStorage "token"

  @negative @security @validation
  Scenario: TC-LOGIN-002 Invalid credentials – unknown email
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | TestUser | known_user@test.com  | Passw0rd |
    When the user navigates to https://practice.expandtesting.com/notes/app/login
    And the user enters "unknown_user@test.com" into the element with test id "login-email"
    And the user enters "Passw0rd" into the element with test id "login-password"
    And the user clicks the element with test id "login-submit"
    Then a toast element with test id "alert-message" should contain exactly "Incorrect email address or password"
    And the browser URL should remain exactly "https://practice.expandtesting.com/notes/app/login"
    And localStorage should NOT contain key "token"

  @negative @security @validation
  Scenario: TC-LOGIN-003 Invalid credentials – wrong password
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | TestUser | user_pw@test.com     | Correct1 |
    When the user navigates to https://practice.expandtesting.com/notes/app/login
    And the user enters "user_pw@test.com" into the element with test id "login-email"
    And the user enters "WrongPass" into the element with test id "login-password"
    And the user clicks the element with test id "login-submit"
    Then a toast element with test id "alert-message" should contain exactly "Incorrect email address or password"
    And the browser URL should remain exactly "https://practice.expandtesting.com/notes/app/login"
    And localStorage should NOT contain key "token"

  @negative @security @validation
  Scenario: TC-LOGIN-004 User enumeration resistance
    # Verify that the same generic error message is shown for both unknown email and wrong password.
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | TestUser | enum_user@test.com   | EnumPass |
    When the user attempts to login with email "nonexistent@test.com" and password "any"
    Then the toast element with test id "alert-message" should contain exactly "Incorrect email address or password"
    When the user attempts to login with email "enum_user@test.com" and password "BadPass"
    Then the toast element with test id "alert-message" should contain exactly "Incorrect email address or password"

  @positive @smoke @validation
  Scenario: TC-LOGIN-005 Forgot password request
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | TestUser | forgot_user@test.com | Forgot123 |
    When the user navigates to https://practice.expandtesting.com/notes/app/forgot-password
    And the user enters "forgot_user@test.com" into the element with test id "forgot-password-email"
    And the user clicks the element with test id "forgot-password-submit"
    Then a toast element with test id "alert-message" should contain exactly "If an account with that email exists, a reset link has been sent"
    And a network request to POST https://practice.expandtesting.com/notes/api/users/forgot-password should have responded with status 200

  @negative @session @validation
  Scenario: TC-LOGIN-006 Session expiry via token revocation
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | TestUser | expiry_user@test.com | ExpireMe |
    And the user logs in successfully (as in TC-LOGIN-001) and obtains token "<token>"
    When the user sends DELETE https://practice.expandtesting.com/notes/api/users/logout with header x-auth-token "<token>"
    And the user reloads https://practice.expandtesting.com/notes/app/
    Then the browser URL should be exactly "https://practice.expandtesting.com/notes/app/login"
    And localStorage should NOT contain key "token"

  @negative @security @validation
  Scenario: TC-LOGIN-007 Token reuse after logout
    # Security case: a stale token must not grant access after logout.
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | TestUser | reuse_user@test.com  | ReusePass |
    And the user logs in successfully and stores token "<token>"
    When the user sends DELETE https://practice.expandtesting.com/notes/api/users/logout with header x-auth-token "<token>"
    And the user sends GET https://practice.expandtesting.com/notes/api/notes with header x-auth-token "<token>"
    Then the response status should be 401
    And the response body field "message" should contain "Invalid or revoked token"

  @negative @validation @security
  Scenario: TC-LOGIN-008 Brute‑force repeated failed attempts
    # The app may lock out, may throttle, or may simply return 401 each time.
    # This scenario records the observed behaviour without assuming a specific outcome.
    Given a new user is registered via POST /users/register with:
      | name     | email                | password |
      | TestUser | brute_user@test.com  | BrutePass |
    When the user performs 6 consecutive login attempts with email "brute_user@test.com" and password "Wrong1"
    Then for each attempt a network request to POST https://practice.expandtesting.com/notes/api/users/login should have responded with status 401
    And the toast element with test id "alert-message" should contain exactly "Incorrect email address or password" on each attempt
    And after the 6th attempt the browser URL should still be "https://practice.expandtesting.com/notes/app/login"
```
