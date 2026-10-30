import { test, expect } from '../../src/fixtures/api-fixture.js';

/**
 * API failures, ON PURPOSE. Run with `npm run demo`.
 *
 *   wrong expected status  → test_defect (the API's 401 is correct)
 *   missing precondition   → test_defect (the test never logs in; the right
 *                            fix is to add the login, NOT to expect a 401)
 *   unreachable host       → environment_issue (port 9 is closed on any
 *                            normal machine: connection refused, exactly what
 *                            a down staging environment looks like)
 *
 * Explanations live up here, not next to the failing lines: the agent reads
 * the source around the failure, and a comment there would hand it the answer.
 */

test.describe('@ai-demo API failures', () => {
  test('DEMO wrong status expectation — invalid login expected to succeed', async ({ notesApi }) => {
    const response = await notesApi.login({ email: 'nobody@example.com', password: 'wrong-password' });

    expect(response.status()).toBe(200);
  });

  test('DEMO missing precondition — user lists their notes', async ({ notesApi }) => {
    const response = await notesApi.listNotes();

    expect(response.status()).toBe(200);
    const body = await notesApi.json<{ data: unknown[] }>(response);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('DEMO environment — service unreachable', async ({ request }) => {
    const response = await request.get('http://127.0.0.1:9/notes/api/health-check', { timeout: 5_000 });

    expect(response.ok()).toBe(true);
  });
});
