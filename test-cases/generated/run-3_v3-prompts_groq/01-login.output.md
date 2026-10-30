```gherkin
Feature: Login module regression suite
  As a release‑gate SDET
  I need deterministic, observable tests that verify all critical login behaviours

  @positive @smoke @validation
  Scenario: TC-LOGIN-001 Valid login
    Given I generate a unique email "<unique-id>@example.com" and password "ValidPass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Test User",
        "email": "<unique-id>@example.com",
        "password": "ValidPass123"
      }
      """
    When I navigate to https://practice.expandtesting.com/notes/app/login
    And I fill "login-email" with "<unique-id>@example.com"
    And I fill "login-password" with "ValidPass123"
    And I click the element with testid "login-submit"
    Then the URL should be exactly https://practice.expandtesting.com/notes/app/
    And localStorage key "token" should exist and be a non‑empty string
    And the element with testid "logout" should be visible

  @negative @security @validation
  Scenario: TC-LOGIN-002 Invalid credentials (wrong password)
    Given I generate a unique email "<unique-id>@example.com" and password "CorrectPass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Test User",
        "email": "<unique-id>@example.com",
        "password": "CorrectPass123"
      }
      """
    When I navigate to https://practice.expandtesting.com/notes/app/login
    And I fill "login-email" with "<unique-id>@example.com"
    And I fill "login-password" with "WrongPass456"
    And I click the element with testid "login-submit"
    Then a toast with testid "alert-message" should contain exactly "Incorrect email address or password"
    And the URL should remain https://practice.expandtesting.com/notes/app/login
    And localStorage key "token" should be absent

  @negative @security @validation
  Scenario: TC-LOGIN-003 Invalid credentials (unknown email)
    Given I generate a unique email "nonexistent-<unique-id>@example.com" and password "AnyPass123"
    When I navigate to https://practice.expandtesting.com/notes/app/login
    And I fill "login-email" with "nonexistent-<unique-id>@example.com"
    And I fill "login-password" with "AnyPass123"
    And I click the element with testid "login-submit"
    Then a toast with testid "alert-message" should contain exactly "Incorrect email address or password"
    And the URL should remain https://practice.expandtesting.com/notes/app/login
    And localStorage key "token" should be absent

  @negative @security @validation
  Scenario: TC-LOGIN-004 User enumeration resistance
    # Verify that the error message does not disclose existence of the account
    Given I generate a unique email "<unique-id>@example.com" and password "SecretPass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Test User",
        "email": "<unique-id>@example.com",
        "password": "SecretPass123"
      }
      """
    When I navigate to https://practice.expandtesting.com/notes/app/login
    And I fill "login-email" with "<unique-id>@example.com"
    And I fill "login-password" with "WrongPass123"
    And I click the element with testid "login-submit"
    Then the toast with testid "alert-message" should contain exactly "Incorrect email address or password"
    When I fill "login-email" with "nonexistent-<unique-id>@example.com"
    And I fill "login-password" with "AnyPass123"
    And I click the element with testid "login-submit"
    Then the toast with testid "alert-message" should contain exactly "Incorrect email address or password"

  @positive @smoke @validation
  Scenario: TC-LOGIN-005 Forgot password flow
    Given I generate a unique email "<unique-id>@example.com" and password "ForgotPass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Test User",
        "email": "<unique-id>@example.com",
        "password": "ForgotPass123"
      }
      """
    When I navigate to https://practice.expandtesting.com/notes/app/forgot-password
    And I fill "forgot-password-email" with "<unique-id>@example.com"
    And I click the element with testid "forgot-password-submit"
    Then a toast with testid "alert-message" should be present
    And the toast text should contain the word "sent"   # @assumption: API returns a generic success message

  @negative @session @validation
  Scenario: TC-LOGIN-006 Session expiry detection
    Given I generate a unique email "<unique-id>@example.com" and password "ExpirePass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Test User",
        "email": "<unique-id>@example.com",
        "password": "ExpirePass123"
      }
      """
    When I login via UI with the credentials above
    And I capture the current token value from localStorage key "token" as "validToken"
    And I invoke DELETE /users/logout with header x-auth-token set to "validToken"
    And I refresh the browser
    Then the URL should be exactly https://practice.expandtesting.com/notes/app/login
    And localStorage key "token" should be absent

  @negative @security @validation
  Scenario: TC-LOGIN-007 Brute‑force / repeated failed attempts
    Given I generate a unique email "<unique-id>@example.com" and password "BrutePass123"
    And I register the user via POST /users/register with body:
      """
      {
        "name": "Test User",
        "email": "<unique-id>@example.com",
        "password": "BrutePass123"
      }
      """
    When I navigate to https://practice.expandtesting.com/notes/app/login
    And I repeat 6 times:
      """
      Fill "login-email" with "<unique-id>@example.com"
      Fill "login-password" with "Wrong1"
      Click the element with testid "login-submit"
      """
    Then for each attempt the toast with testid "alert-message" should contain exactly "Incorrect email address or password"
    And after the 6th attempt I record the HTTP response status of the login request as "finalStatus"
    And I log "finalStatus" for analysis   # @assumption: system may lockout or rate‑limit; we just capture the observed status

  @negative @validation @security
  Scenario: TC-LOGIN-008 Client‑side validation – malformed email
    When I navigate to https://practice.expandtesting.com/notes/app/login
    And I fill "login-email" with "invalid-email-format"
    And I fill "login-password" with "AnyPass123"
    Then the inline validation message near "login-email" should contain exactly "Email address is invalid"
    And the element with testid "login-submit" should be disabled

  @negative @validation @security
  Scenario: TC-LOGIN-009 Client‑side validation – password length
    When I navigate to https://practice.expandtesting.com/notes/app/login
    And I fill "login-email" with "user@example.com"
    And I fill "login-password" with "short"
    Then the inline validation message near "login-password" should contain exactly "Password should be between 6 and 30 characters"
    And the element with testid "login-submit" should be disabled
```
