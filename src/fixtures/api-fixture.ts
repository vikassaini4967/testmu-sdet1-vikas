import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import { triageAndAttach } from '../ai/attach.js';
import { collectSourceSnippet } from '../ai/context-collector.js';
import { NotesApiClient, uniqueUser } from '../api/notes.client.js';

export interface ApiUser {
  name: string;
  email: string;
  password: string;
  token: string;
}

/**
 * API fixture.
 *
 * Kept separate from the UI fixture on purpose: depending on `page` here would
 * launch a browser for every API spec, which is slow and pointless. This one
 * depends on `request` only.
 *
 * `notesApi` records the last exchange so that when an assertion fails, the
 * triage agent gets the real request and response rather than just
 * "expected 200, got 400".
 */
export const test = base.extend<{
  aiTriage: void;
  notesApi: NotesApiClient;
  /** Registers + logs in a fresh user; returns a factory so a test can make several (IDOR cases). */
  makeUser: () => Promise<ApiUser>;
}>({
  notesApi: async ({ request }, use) => {
    await use(new NotesApiClient(request));
  },

  makeUser: async ({ request }, use) => {
    const created: ApiUser[] = [];
    await use(async () => {
      const api = new NotesApiClient(request);
      const user = uniqueUser('api');
      const registered = await api.register(user);
      if (registered.status() !== 201) {
        throw new Error(`Test data setup failed: register returned ${registered.status()} ${await registered.text()}`);
      }
      const login = await api.json<{ data: { token: string } }>(await api.login(user));
      const apiUser = { ...user, token: login.data.token };
      created.push(apiUser);
      return apiUser;
    });
    // Cleanup: log in again — a test may have revoked the token.
    for (const user of created) {
      const api = new NotesApiClient(request);
      const login = await api.login(user);
      if (!login.ok()) continue;
      api.setToken(((await login.json()) as { data: { token: string } }).data.token);
      await api.deleteAccount();
    }
  },

  aiTriage: [
    async ({ notesApi }, use, testInfo) => {
      await use();

      if (testInfo.status === testInfo.expectedStatus) return;

      const last = notesApi.lastExchange;
      const error = testInfo.error;
      await triageAndAttach(testInfo, {
        testTitle: testInfo.title,
        testFile: path.relative(process.cwd(), testInfo.file).replace(/\\/g, '/'),
        project: testInfo.project.name,
        retry: testInfo.retry,
        durationMs: testInfo.duration,
        errorMessage: error?.message ?? 'Test failed without an error message.',
        errorStack: error?.stack,
        sourceSnippet: collectSourceSnippet(error?.stack, testInfo.file),
        request: last ? { method: last.method, url: last.url, body: last.requestBody } : undefined,
        response: last
          ? { status: last.status, statusText: last.statusText, body: last.responseBody, headers: last.responseHeaders }
          : undefined,
      });
    },
    { auto: true, timeout: 180_000 },
  ],
});

export { expect };
