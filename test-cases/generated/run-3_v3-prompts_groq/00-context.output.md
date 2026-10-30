**Summary of the system (5 bullets)**  
- UI is a React SPA at `https://practice.expandtesting.com/notes/app/` with login, forgot‑password, dashboard, note cards, category filter buttons, search, add‑note, progress info, and logout; session token is stored in `localStorage["token"]`.  
- Invalid or revoked token causes a client‑side redirect to `/login`; a logged‑out user sees a public landing page at `/notes/app/` (no automatic redirect).  
- REST API base `https://practice.expandtesting.com/notes/api` uses an `x-auth-token` header for authentication and returns a consistent envelope `{ success, status, message, data? }`.  
- User endpoints: `POST /users/register`, `POST /users/login`, `GET /users/profile`, `DELETE /users/logout`, `DELETE /users/delete-account`, `POST /users/forgot-password`.  
- Note endpoints: `POST /notes` (title 4‑100 chars, description 4‑1000 chars, category Home|Work|Personal), `GET /notes`, and CRUD on `/notes/:id` (24‑hex ObjectId); validation errors and unknown/malformed IDs return 400/404 with field‑specific messages.

**Ambiguities / verification needed**  
- Rate‑limiting behavior: is it enforced, what status code / headers are returned when limit is exceeded?  
- Exact text of toast messages for server errors (e.g., after a failed API call) – only client‑side validation messages are listed.  
- Whether the `DELETE /users/logout` endpoint returns a body (e.g., success message) or just a status code.  
- Does the `GET /users/profile` endpoint require any specific fields in the response data (e.g., name, email, created_at)?  
- Are there any pagination or query parameters supported on `GET /notes` (e.g., limit, offset, filter by category) that are not documented?
