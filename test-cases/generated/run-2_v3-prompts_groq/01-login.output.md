```gherkin
Feature: LOGIN module regression suite
  The suite validates all critical behaviours of the login flow, including success, error handling,
  password recovery, session handling and security‑related edge cases.

  @positive @smoke @validation
  Scenario: TC-LOGIN-001 Valid login
    Given I register a new user via POST /users/register with unique email "<unique-id>@example.com", name "Test User", password "ValidPass123"
    And I store the returned email as "testEmail" and password as "testPassword"
    When I navigate to https://practice.expandtesting.com/notes/app/login
    And I fill the input with test id "login-email" with "testEmail"
    And I fill the input with test id "login-password" with "testPassword"
    And I click the button with test id "login-submit"
    Then the browser URL should be exactly "https://practice.expandtesting.com/notes/app/"
    And localStorage should contain key "token" with a non‑empty string
    And the element with test id "logout" should be visible

  @negative @validation @security
  Scenario: TC-LOGIN-002 Invalid credentials (wrong password)
    Given I register a new user via POST /users/register with unique email "<unique-id>@example.com", name "Test User", password "ValidPass123"
    When I navigate to https://practice.expandtesting.com/notes/app/login
    And I fill the input with test id "login-email" with the registered email
    And I fill the input with test id "login-password" with "WrongPass456"
    And I click the button with test id "login-submit"
    Then a toast element with test id "alert-message" should contain exactly "Incorrect email address or password"
    And localStorage should NOT contain key "token"

  @negative @validation @security
  Scenario: TC-LOGIN-003 Invalid credentials (unknown email)
    Given I have no account with email "nonexistent-<unique-id>@example.com"
    When I navigate to https://practice.expandtesting.com/notes/app/login
    And I fill the input with test id "login-email" with "nonexistent-<unique-id>@example.com"
    And I fill the input with test id "login-password" with "AnyPass123"
    And I click the button with test id "login-submit"
    Then a toast element with test id "alert-message" should contain exactly "Incorrect email address or password"
    And localStorage should NOT contain key "token"

  @negative @validation @security
  Scenario: TC-LOGIN-004 User enumeration resistance
    # The UI message for both unknown email and wrong password is identical per system facts.
    Given I register a new user via POST /users/register with unique email "<unique-id>@example.com", name "Test User", password "ValidPass123"
    When I attempt login with email "nonexistent-<unique-id>@example.com" and password "ValidPass123"
    Then the toast "alert-message" must display exactly "Incorrect email address or password"
    When I attempt login with the registered email and password "WrongPass123"
    Then the toast "alert-message" must display exactly "Incorrect email address or password"

  @negative @validation @security
  Scenario: TC-LOGIN-005 Forgot password flow
    Given I register a new user via POST /users/register with unique email "<unique-id>@example.com", name "Test User", password "ValidPass123"
    When I navigate to https://practice.expandtesting.com/notes/app/forgot-password
    And I fill the input with test id "forgot-password-email" with the registered email
    And I click the button with test id "forgot-password-submit"
    Then the response of POST /users/forgot-password should have status 200
    And the response envelope should contain a non‑empty "message" field

  @negative @session @validation
  Scenario: TC-LOGIN-006 Session expiry after logout
    Given I register a new user via POST /users/register with unique email "<unique-id>@example.com", name "Test User", password "ValidPass123"
    And I obtain a valid token by logging in via POST /users/login
    When I send DELETE /users/logout with header x-auth-token set to the obtained token
    Then the response should have status 200
    And the token should be revoked (subsequent request with same token is unauthorized)
    When I navigate to https://practice.expandtesting.com/notes/app/
    Then the browser should be redirected to "https://practice.expandtesting.com/notes/app/login"

  @negative @validation @security
  Scenario: TC-LOGIN-007 Brute‑force repeated failed attempts
    Given I register a new user via POST /users/register with unique email "<unique-id>@example.com", name "Test User", password "ValidPass123"
    When I attempt login with the registered email and password "Wrong1" five times in quick succession
    Then each login response should have status 401
    And each toast "alert-message" should contain exactly "Incorrect email address or password"
    # Record behaviour for lockout – if a lockout occurs, later attempts will have a different status or message.
    # No assumption is made about lockout; the test simply logs the observed status/code for each attempt.

  @negative @validation @security
  Scenario: TC-LOGIN-008 Token reuse after logout (session fixation)
    Given I register a new user via POST /users/register with unique email "<unique-id>@example.com", name "Test User", password "ValidPass123"
    And I obtain a token by logging in via POST /users/login
    When I send DELETE /users/logout with header x-auth-token set to the obtained token
    Then the logout response should have status 200
    When I make a GET /users/profile request with the same (now revoked) token
    Then the response should have status 401
    And the SPA should redirect to "/login" if the request is made from the UI (verify by navigating to the dashboard with the revoked token stored in localStorage)

  @positive @smoke @validation
  Scenario: TC-LOGIN-009 Token persistence across page reload
    Given I register a new user via POST /users/register with unique email "<unique-id>@example.com", name "Test User", password "ValidPass123"
    When I log in via the UI with the registered credentials
    And I reload the page at https://practice.expandtesting.com/notes/app/
    Then localStorage must still contain the same "token" value as before reload
    And the dashboard elements (e.g., button with test id "add-new-note") remain visible

  @negative @validation @security
  Scenario: TC-LOGIN-010 CSRF protection on login (assumption)
    @assumption
    # Assume the login POST endpoint requires a CSRF token sent as header "x-csrf-token".
    Given I register a new user via POST /users/register with unique email "<unique-id>@example.com", name "Test User", password "ValidPass123"
    When I send POST /users/login with valid credentials but omit the "x-csrf-token" header
    Then the response should have status 400
    And the response envelope's "message" should mention "CSRF" or "missing token"
```
