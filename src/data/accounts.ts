import type { APIRequestContext } from '@playwright/test';
import { NotesApiClient, uniqueUser } from '../api/notes.client.js';
import type { Category, Note } from '../api/schemas.js';

/**
 * Test data is created through the API, never by hand.
 *
 * Every test that needs a user gets a fresh one with a known set of notes and
 * deletes it afterwards. No shared account means no order dependence, no
 * "works on my account" and no manual setup — `npm test` on a fresh clone
 * needs nothing but network access.
 */

export interface TestAccount {
  name: string;
  email: string;
  password: string;
  token: string;
  notes: Note[];
}

/**
 * Seeded on purpose to exercise every dashboard rule: all three categories,
 * two in one category (so a filter has something to narrow), and one
 * completed (so ordering and the progress counter have something to prove).
 */
export const SEED_NOTES: { title: string; description: string; category: Category; completed?: boolean }[] = [
  { title: 'Pay electricity bill', description: 'Due on the 5th of the month', category: 'Home' },
  { title: 'Prepare sprint demo', description: 'AI triage walkthrough for the team', category: 'Work' },
  { title: 'Book dentist appointment', description: 'Routine check-up', category: 'Personal' },
  { title: 'Review regression report', description: 'Triage last night’s CI failures', category: 'Work', completed: true },
];

async function expectOk(api: NotesApiClient, step: string, response: Awaited<ReturnType<NotesApiClient['login']>>) {
  if (!response.ok()) {
    // Phrased for the AI triage too: a setup failure is environment, not product.
    throw new Error(
      `Test data setup failed at "${step}": ${api.lastExchange?.method} ${api.lastExchange?.url} → HTTP ${response.status()}\n${(await response.text()).slice(0, 300)}`,
    );
  }
}

export async function createAccount(request: APIRequestContext, options: { seed?: boolean } = {}): Promise<TestAccount> {
  const api = new NotesApiClient(request);
  const user = uniqueUser('ui');

  await expectOk(api, 'register', await api.register(user));
  const login = await api.login({ email: user.email, password: user.password });
  await expectOk(api, 'login', login);
  const token = ((await login.json()) as { data: { token: string } }).data.token;
  api.setToken(token);

  const notes: Note[] = [];
  if (options.seed) {
    // Sequential, so created_at/updated_at order is deterministic.
    for (const seed of SEED_NOTES) {
      const created = await api.createNote(seed);
      await expectOk(api, `create note "${seed.title}"`, created);
      let note = ((await created.json()) as { data: Note }).data;
      if (seed.completed) {
        const patched = await api.setCompleted(note.id, true);
        await expectOk(api, `complete note "${seed.title}"`, patched);
        note = ((await patched.json()) as { data: Note }).data;
      }
      notes.push(note);
    }
  }

  return { ...user, token, notes };
}

/** Best-effort cleanup; logs in again because a test may have revoked the token. */
export async function deleteAccount(request: APIRequestContext, account: TestAccount): Promise<void> {
  const api = new NotesApiClient(request);
  try {
    const login = await api.login({ email: account.email, password: account.password });
    if (!login.ok()) return;
    api.setToken(((await login.json()) as { data: { token: string } }).data.token);
    await api.deleteAccount();
  } catch {
    // Never fail a test on teardown of throwaway data.
  }
}
