TASK: Same system, same role, same output contract. Now the REST API. IDs: TC-API-001, TC-API-002, …

REQUIRED COVERAGE — every item, explicitly:
1. Auth token validation
2. CRUD operations
3. Error handling (4xx / 5xx)
4. Rate limiting
5. Schema validation

CONSTRAINTS:
- Separate "the server rejected bad input" (assert the specific 4xx) from "the server fell over" (assert NOT 5xx). Several cases must assert the absence of 5xx explicitly.
- Schema validation means field presence AND types AND formats (ObjectId, ISO-8601 timestamps, enums). List them in the steps. "Status is 200" is not schema validation.
- Cover authorization, not only authentication: user B must not read, update or delete user A's note.
- Token validation includes the token's lifecycle: a logged-out token must stop working.
- CRUD is ONE lifecycle case that proves delete really deleted (re-read → 404), not four disconnected cases.
- Rate limiting is undocumented. The case must pass whether or not the API throttles, fail on any 5xx or unexpected status, and record which behaviour it saw. Do not assert a 429.
- Every case creates and deletes its own users and data, so the suite can run in parallel.

OUTPUT CONTRACT: as for Login. 10 to 13 scenarios.

SELF-CHECK: as for Login, and confirm every endpoint you used appears in the system facts.
