import { test, expect } from '../../src/fixtures/api-fixture.js';
import {
  assertSchema,
  envelope,
  errorResponseSchema,
  loginResponseSchema,
  noteResponseSchema,
  notesListResponseSchema,
  profileResponseSchema,
  userSchema,
} from '../../src/api/schemas.js';
import { uniqueUser } from '../../src/api/notes.client.js';

/**
 * REST API — test-cases/api.feature (TC-API-001 … 013).
 *
 * Every test creates its own users through `makeUser` and the fixture deletes
 * them afterwards, so the suite runs fully parallel and leaves nothing behind.
 */

test.describe('Notes REST API', () => {
  test('TC-API-001 health check reports the service up', async ({ notesApi }) => {
    const response = await notesApi.healthCheck();

    expect(response.status()).toBe(200);
    const body = assertSchema(envelope, await notesApi.json(response), 'GET /health-check');
    expect(body.success).toBe(true);
  });

  test('TC-API-002 register, login and profile return schema-valid bodies with a usable token', async ({ notesApi }) => {
    const user = uniqueUser('api');

    const registered = await notesApi.register(user);
    expect(registered.status()).toBe(201);
    const reg = assertSchema(envelope.extend({ data: userSchema }), await notesApi.json(registered), 'POST /users/register');
    expect(reg.data.email).toBe(user.email);

    const loginResponse = await notesApi.login(user);
    expect(loginResponse.status()).toBe(200);
    const login = assertSchema(loginResponseSchema, await notesApi.json(loginResponse), 'POST /users/login');

    notesApi.setToken(login.data.token);
    const profile = assertSchema(profileResponseSchema, await notesApi.json(await notesApi.profile()), 'GET /users/profile');
    expect(profile.data).toEqual({ id: reg.data.id, name: user.name, email: user.email });

    expect((await notesApi.deleteAccount()).status()).toBe(200);
  });

  test('TC-API-003 wrong password and unknown email get the identical 401 with no token', async ({ notesApi, makeUser }) => {
    const user = await makeUser();

    const wrongPassword = await notesApi.login({ email: user.email, password: 'Wrong-Password-1' });
    const wrongBody = assertSchema(errorResponseSchema, await notesApi.json(wrongPassword), 'login, wrong password');

    const unknownEmail = await notesApi.login({ email: `nobody.${Date.now()}@example.com`, password: 'Wrong-Password-1' });
    const unknownBody = assertSchema(errorResponseSchema, await notesApi.json(unknownEmail), 'login, unknown email');

    expect([wrongPassword.status(), unknownEmail.status()]).toEqual([401, 401]);
    expect(unknownBody.message, 'messages must not reveal which part was wrong').toBe(wrongBody.message);
  });

  test('TC-API-004 a protected route rejects a missing token with 401', async ({ notesApi }) => {
    notesApi.setToken(null);
    const response = await notesApi.listNotes();

    expect(response.status()).toBe(401);
    const body = assertSchema(errorResponseSchema, await notesApi.json(response), 'GET /notes (no token)');
    expect(body.message).toMatch(/x-auth-token/i);
  });

  test('TC-API-005 a malformed token is rejected with 401, not a 5xx', async ({ notesApi }) => {
    for (const token of ['not-a-real-token', 'a'.repeat(64), "' OR '1'='1"]) {
      notesApi.setToken(token);
      const response = await notesApi.listNotes();
      // A 500 here is a crash on untrusted input — a security finding, not a validation message.
      expect(response.status(), `token ${JSON.stringify(token)}`).toBe(401);
      assertSchema(errorResponseSchema, await notesApi.json(response), 'GET /notes (bad token)');
    }
  });

  test('TC-API-006 note CRUD lifecycle, ending with proof the delete really deleted', async ({ notesApi, makeUser }) => {
    notesApi.setToken((await makeUser()).token);

    const createdResponse = await notesApi.createNote({ title: 'Regression note', description: 'Created by the SDET suite', category: 'Work' });
    expect(createdResponse.status()).toBe(200); // this API answers create with 200, not 201
    const created = assertSchema(noteResponseSchema, await notesApi.json(createdResponse), 'POST /notes');
    expect(created.data).toMatchObject({ title: 'Regression note', category: 'Work', completed: false });
    const id = created.data.id;

    const fetched = assertSchema(noteResponseSchema, await notesApi.json(await notesApi.getNote(id)), 'GET /notes/:id');
    expect(fetched.data).toEqual(created.data);

    const list = assertSchema(notesListResponseSchema, await notesApi.json(await notesApi.listNotes()), 'GET /notes');
    expect(list.data.map((n) => n.id)).toEqual([id]);

    const updated = assertSchema(
      noteResponseSchema,
      await notesApi.json(
        await notesApi.updateNote(id, { title: 'Regression note (updated)', description: 'Updated by the SDET suite', completed: true, category: 'Personal' }),
      ),
      'PUT /notes/:id',
    );
    expect(updated.data).toMatchObject({ title: 'Regression note (updated)', category: 'Personal', completed: true });
    expect(updated.data.updated_at > created.data.updated_at, 'updated_at advances').toBe(true);

    const patched = assertSchema(noteResponseSchema, await notesApi.json(await notesApi.setCompleted(id, false)), 'PATCH /notes/:id');
    expect(patched.data.completed).toBe(false);

    expect((await notesApi.deleteNote(id)).status()).toBe(200);
    expect((await notesApi.getNote(id)).status()).toBe(404);
    expect((await notesApi.json<{ data: unknown[] }>(await notesApi.listNotes())).data).toEqual([]);
  });

  test('TC-API-007 invalid note input is rejected with 400 and a field-level message, and nothing is stored', async ({
    notesApi,
    makeUser,
  }) => {
    notesApi.setToken((await makeUser()).token);
    const cases = [
      { body: { title: 'ab', description: 'title too short', category: 'Home' }, field: /title/i },
      { body: { title: 'x'.repeat(101), description: 'title too long', category: 'Home' }, field: /title/i },
      { body: { title: 'Valid title', description: 'bad category', category: 'Garden' }, field: /category/i },
      { body: { title: 'Valid title', description: 'y'.repeat(1001), category: 'Work' }, field: /description/i },
    ];

    for (const { body, field } of cases) {
      const response = await notesApi.raw('post', '/notes', body);
      expect(response.status(), JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(assertSchema(errorResponseSchema, await notesApi.json(response), 'POST /notes (invalid)').message).toMatch(field);
    }

    expect((await notesApi.json<{ data: unknown[] }>(await notesApi.listNotes())).data).toEqual([]);
  });

  test('TC-API-008 an unknown note id is 404 and a malformed id is 400 — never 5xx', async ({ notesApi, makeUser }) => {
    notesApi.setToken((await makeUser()).token);

    const unknown = await notesApi.getNote('000000000000000000000000');
    expect(unknown.status()).toBe(404);
    assertSchema(errorResponseSchema, await notesApi.json(unknown), 'GET /notes/:unknown');

    for (const id of ['not-an-id', '%%%', '1']) {
      const malformed = await notesApi.getNote(id);
      expect(malformed.status(), `id ${JSON.stringify(id)}`).toBe(400);
    }
  });

  test("TC-API-009 a user cannot read, change or delete another user's note", async ({ notesApi, makeUser }) => {
    const owner = await makeUser();
    const intruder = await makeUser();

    notesApi.setToken(owner.token);
    const note = assertSchema(
      noteResponseSchema,
      await notesApi.json(await notesApi.createNote({ title: 'Private note', description: 'Owner-only content', category: 'Personal' })),
      'POST /notes',
    ).data;

    notesApi.setToken(intruder.token);
    const attempts = {
      read: (await notesApi.getNote(note.id)).status(),
      update: (await notesApi.updateNote(note.id, { title: 'Hijacked', description: 'by intruder', completed: true, category: 'Home' })).status(),
      complete: (await notesApi.setCompleted(note.id, true)).status(),
      delete: (await notesApi.deleteNote(note.id)).status(),
    };
    for (const [action, status] of Object.entries(attempts)) {
      expect([401, 403, 404], `IDOR on ${action}: got ${status}`).toContain(status);
    }

    notesApi.setToken(owner.token);
    const after = assertSchema(noteResponseSchema, await notesApi.json(await notesApi.getNote(note.id)), 'owner re-read');
    expect(after.data).toEqual(note);
  });

  test('TC-API-010 a burst of requests is throttled or handled — never 5xx (rate limiting recorded)', async ({ notesApi }) => {
    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, i) => notesApi.login({ email: `burst.${Date.now()}.${i}@example.com`, password: 'Nope#1234' })),
    );
    const statuses = responses.map((r) => r.status());

    expect(statuses.filter((s) => s >= 500), `5xx under burst: ${statuses.join(',')}`).toEqual([]);
    expect(statuses.every((s) => s === 401 || s === 429), `unexpected statuses: ${[...new Set(statuses)]}`).toBe(true);

    // Passing under either behaviour is deliberate: there is no evidence this
    // target throttles, and asserting a 429 would be a permanent false failure.
    test.info().annotations.push({
      type: statuses.includes(429) ? 'rate-limit' : 'security-observation',
      description: statuses.includes(429)
        ? `Throttled: ${statuses.filter((s) => s === 429).length}/25 got 429.`
        : 'No rate limiting observed: 25 concurrent failed logins all returned 401.',
    });
  });

  test('TC-API-011 logout revokes the token server-side', async ({ notesApi, makeUser }) => {
    notesApi.setToken((await makeUser()).token);
    expect((await notesApi.listNotes()).status()).toBe(200);

    expect((await notesApi.logout()).status()).toBe(200);

    const reused = await notesApi.listNotes();
    expect(reused.status(), 'a logged-out token must not keep working').toBe(401);
    assertSchema(errorResponseSchema, await notesApi.json(reused), 'GET /notes (revoked token)');
  });

  test('TC-API-012 validation errors share one error envelope with no internals leaked', async ({ notesApi, makeUser }) => {
    notesApi.setToken((await makeUser()).token);
    const probes = [
      notesApi.raw('post', '/notes', { category: 'Home' }),
      notesApi.raw('patch', '/notes/000000000000000000000000', { completed: 'maybe' }),
      notesApi.raw('post', '/users/register', { name: 'Bad Email', email: 'not-an-email', password: 'Secret#123' }),
      notesApi.raw('get', '/does-not-exist'),
    ];

    for (const response of await Promise.all(probes)) {
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(response.status()).toBeLessThan(500);
      const text = await response.text();
      expect(text, 'no stack traces or file paths in error bodies').not.toMatch(/at \w+ \(|node_modules|\.js:\d+/);
      assertSchema(errorResponseSchema, JSON.parse(text), `${response.url()} (${response.status()})`);
    }
  });

  test('TC-API-013 a malformed JSON body gets the same error envelope as any other 400', async ({ notesApi, makeUser }) => {
    test.info().annotations.push({
      type: 'issue',
      description:
        'KNOWN-BUG-003: malformed JSON returns 400 {"success":false,"message":"Unexpected end of JSON input"} — the "status" field is missing and the raw parser message leaks.',
    });
    test.fail();

    notesApi.setToken((await makeUser()).token);
    const response = await notesApi.rawBody('post', '/notes', '{"title": "Broken', 'application/json');

    expect(response.status()).toBe(400);
    assertSchema(errorResponseSchema, await notesApi.json(response), 'POST /notes (malformed JSON)');
  });
});
