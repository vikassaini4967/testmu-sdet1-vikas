**Summary of the system (5 bullets)**  
- The Notes practice app is a React SPA at `https://practice.expandtesting.com/notes/app/` with a login page, forgot‑password page, and a logged‑in dashboard that shows note cards, category filter buttons, a search box, an “add new note” button, progress text, and a logout button. Session tokens are stored in `localStorage` under the key `token`.  
- Authentication is performed via the REST API (`https://practice.expandtesting.com/notes/api`). Login returns a token at `data.token`; subsequent API calls require the header `x‑auth‑token: <token>`. Invalid or revoked tokens cause the SPA to redirect to `/login`.  
- User‑related endpoints: `POST /users/register`, `POST /users/login`, `GET /users/profile`, `DELETE /users/logout`, `DELETE /users/delete-account`, `POST /users/forgot-password`. Register returns **201**; duplicate email returns **409**. Bad login credentials return **401**.  
- Note‑related endpoints: `POST /notes` (create), `GET /notes` (list), and `GET|PUT|PATCH|DELETE /notes/:id` (operate on a note identified by a 24‑hex ObjectId). Create requires `title` (4‑100 chars), `description` (4‑1000 chars), `category` (`Home|Work|Personal`). Validation errors, malformed IDs, or unknown IDs return **400** or **404** as described, with an envelope `{ success, status, message, data? }`.  
- UI error handling: server‑side errors appear in a toast (`alert-message`). Client‑side validation shows inline messages such as “Email address is invalid” or “Password should be between 6 and 30 characters”. Wrong password or unknown email shows “Incorrect email address or password”. The public landing page is shown when logged out; the app does **not** redirect to `/login` in that case.

**Open questions / ambiguities to verify before test authoring**  
- Rate limiting: Is there a documented limit (e.g., requests per minute) and what response is returned when the limit is exceeded?  
- Does the `GET /notes` endpoint support query parameters for filtering by category or searching by title/description? If so, what are the exact parameter names and expected formats?  
- For the `PATCH /notes/:id` endpoint, which fields are allowed to be partially updated and what are the validation rules for each?  
- Are there any size limits or pagination defaults for the `GET /notes` response (e.g., max notes returned per page)?  
- When a note is created, is the `completed` field defaulted to `false` and are `created_at`/`updated_at` timestamps generated automatically by the server?  (Need confirmation for assertions on response payload.)
