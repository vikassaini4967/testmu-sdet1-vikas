# Module: Login
# Curated from LLM-generated cases (prompts.md), then corrected against the live app on 2026-10-30.
# Automated in tests/login/login.spec.ts — scenario IDs map 1:1 to test titles (npm run check:trace).

Feature: Login
  As a registered user of the Notes app
  I want to authenticate
  So that I can reach my notes, and nobody else can

  Background:
    Given a fresh user registered through the API
    And the login page is open

  @positive @smoke
  Scenario: TC-LOGIN-001 Valid credentials land the user on the dashboard
    When I log in with that user's email and password
    Then the logout button and the add-note button are visible
    And the URL is /notes/app/
    And a session token is stored in localStorage

  @negative @security
  Scenario: TC-LOGIN-002 Wrong password is rejected and no session is created
    When I log in with the right email and a wrong password
    Then the toast reads "Incorrect email address or password"
    And I am still on /login
    And no token is stored in localStorage

  @negative @security
  Scenario: TC-LOGIN-003 Unknown email and wrong password are indistinguishable
    When I log in with the right email and a wrong password
    And I log in with an email that was never registered
    Then both attempts show the identical message
    And both login requests returned 401

  @negative @validation
  Scenario: TC-LOGIN-004 Malformed email is rejected client-side without a network call
    When I submit "not-an-email" as the email
    Then the inline message "Email address is invalid" is shown
    And no request is sent to /users/login

  @positive
  Scenario: TC-LOGIN-005 Forgot password link reaches the recovery form
    When I click "Forgot password"
    Then the URL is /forgot-password
    And the "Reset your password" form has an editable email field and an enabled submit button

  @negative @session @security
  Scenario: TC-LOGIN-006 A session revoked server-side is sent back to login
    Given I am logged in through the UI
    When the token held by the browser is revoked with DELETE /users/logout
    And I reload the page
    Then I am redirected to /login
    And the logout button is gone

  # Lockout is undocumented. Passing under either behaviour is deliberate; the
  # absence of a lockout is recorded as a security observation, not hidden.
  @negative @security
  Scenario: TC-LOGIN-007 Repeated failed logins stay controlled
    When I submit a wrong password 5 times in a row
    Then every attempt shows an error toast
    And every /users/login response is 401 or 429, never 5xx
    And if none was 429, a "no lockout or throttling" observation is recorded

  @positive @security
  Scenario: TC-LOGIN-008 Password is masked and never sent in the URL
    Then the password field has type "password"
    When I submit the form
    Then the login request is a POST
    And the password appears neither in the request URL nor in the page URL

  # KNOWN-BUG-002 — automated as test.fail(); flips red the day it is fixed.
  @negative @security @known-bug
  Scenario: TC-LOGIN-009 Forgot password does not reveal whether an account exists
    Given the forgot password page is open
    When I request a reset for an email that was never registered
    Then a message is shown
    And it does not say that no account exists for that email
