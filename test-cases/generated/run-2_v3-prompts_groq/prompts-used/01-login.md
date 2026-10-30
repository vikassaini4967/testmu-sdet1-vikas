TASK: Write regression test cases for the LOGIN module of the system above.

ROLE: You are writing the suite that gates releases. A case you miss is a defect that ships; a case that can pass for the wrong reason is worse than no case.

REQUIRED COVERAGE — every item, explicitly:
1. Valid login
2. Invalid credentials
3. Forgot password
4. Session expiry
5. Brute-force / repeated failed attempts

CONSTRAINTS:
- One case per distinct FAILURE MODE. Do not write variations of "wrong password shows an error".
- Every Then step names an observable that can actually fail: a URL, a test id, an exact message, a stored token, a network request. "The user is logged in successfully" is not an assertion.
- Include at least two security cases a functional tester would miss. User enumeration through the login message is one; find another in this module.
- Session expiry must be deterministic and run in under 5 seconds. No "wait 30 minutes".
- Lockout behaviour is NOT documented. Write the brute-force case so it is honest under either behaviour, and say what it records.
- Do not assume behaviour that is not in the system facts. If a case depends on an assumption, tag it @assumption and state the assumption in a comment line above the scenario.
- Each case creates its own user through the API in a Given step. No shared accounts.

OUTPUT CONTRACT:
- Gherkin only: one Feature, no prose outside it.
- One Scenario per case; a Scenario Outline only where the same assertion runs over different data.
- Every scenario title starts with its ID: TC-LOGIN-001, TC-LOGIN-002, …
- Tags: exactly one of @positive / @negative, plus at least one of @smoke @security @session @validation.
- 7 to 10 scenarios.

SELF-CHECK before answering: for each scenario ask "could this pass while the feature is broken?" If yes, tighten its Then steps.
