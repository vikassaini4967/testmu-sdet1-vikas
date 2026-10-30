I'm building a regression suite for a web app and its REST API. Before any test cases, hold the system facts below so later answers don't invent UI or endpoints that don't exist. Every fact here was verified against the live system on 2026-10-30.

SYSTEM UNDER TEST — ExpandTesting "Notes" practice app

UI (React SPA), base https://practice.expandtesting.com/notes/app/
- /login: email input (data-testid=login-email, type=text), password (login-password, type=password), submit button (login-submit). Server errors appear in a toast (alert-message). Client-side validation shows inline messages, e.g. "Email address is invalid", "Password should be between 6 and 30 characters".
- A wrong password and an unknown email both show "Incorrect email address or password".
- /forgot-password: email input (forgot-password-email), submit (forgot-password-submit).
- Dashboard (/notes/app/ when logged in): note cards (note-card, note-card-title, note-card-description, toggle-note-switch), category filter BUTTONS category-all / category-home / category-work / category-personal (not a dropdown), search (search-input, search-btn), add note (add-new-note), progress text (progress-info) e.g. "You have 1/4 notes completed in the all categories", logout BUTTON (logout).
- The session token is stored in localStorage under "token".
- Logged out, /notes/app/ shows a public landing page ("Welcome to Notes App"). It does NOT redirect to /login.
- A revoked or invalid token makes the app redirect to /login.
- There are no user roles and no admin features.

REST API, base https://practice.expandtesting.com/notes/api
- Auth header: x-auth-token: <token> (NOT Authorization: Bearer).
- Response envelope: { success, status, message, data? }.
- POST /users/register {name, email, password} → 201; duplicate email → 409.
- POST /users/login → 200 with the token at data.token; bad credentials → 401.
- GET /users/profile · DELETE /users/logout (revokes the token) · DELETE /users/delete-account · POST /users/forgot-password {email}.
- POST /notes {title 4–100 chars, description 4–1000 chars, category Home|Work|Personal} → 200.
- GET /notes · GET | PUT | PATCH | DELETE /notes/:id, where id is a 24-hex ObjectId.
- Note fields: id, title, description, category, completed, created_at, updated_at, user_id.
- Unknown id → 404; malformed id → 400; validation errors → 400 with a message naming the field.
- Rate limiting: not documented either way.

Do not write test cases yet. Reply with:
1. A 5-bullet summary of the system as you understand it.
2. Anything above that is ambiguous, or that you would want verified before writing a test against it.
