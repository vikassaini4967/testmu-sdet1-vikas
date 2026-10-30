import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { Category } from './schemas.js';

export interface ApiExchange {
  method: string;
  url: string;
  requestBody?: string;
  status: number;
  statusText: string;
  responseBody?: string;
  responseHeaders: Record<string, string>;
  durationMs: number;
}

export const API_BASE = (process.env.API_BASE_URL ?? 'https://practice.expandtesting.com/notes/api').replace(/\/$/, '');

/** The API accepts form-encoded or JSON; form keeps bodies flat and explicit. */
type FormBody = Record<string, string | number | boolean>;

/**
 * Typed client for the ExpandTesting Notes API.
 *
 * Every call records its full exchange in `lastExchange`. When an assertion
 * fails, the API fixture hands that to the triage agent, so the model sees the
 * real 400 body — "Title must be between 4 and 100 characters" — instead of
 * just `expect(received).toBe(expected)`. Most of the quality of the AI output
 * comes from this, not from the prompt.
 */
export class NotesApiClient {
  lastExchange: ApiExchange | null = null;
  private token: string | null = null;

  constructor(private readonly request: APIRequestContext) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private async record(method: string, url: string, body: unknown, response: APIResponse, startedAt: number) {
    let responseBody: string | undefined;
    try {
      responseBody = (await response.text()).slice(0, 4_000);
    } catch {
      responseBody = undefined;
    }

    this.lastExchange = {
      method,
      url,
      // Never hand a password to the LLM, even a throwaway one.
      requestBody: body ? JSON.stringify(body, (k, v) => (k === 'password' ? '***' : v)).slice(0, 2_000) : undefined,
      status: response.status(),
      statusText: response.statusText(),
      responseBody,
      responseHeaders: response.headers(),
      durationMs: Date.now() - startedAt,
    };
  }

  private async send(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    endpoint: string,
    body?: FormBody,
    extraHeaders: Record<string, string> = {},
  ): Promise<APIResponse> {
    const url = `${API_BASE}${endpoint}`;
    const startedAt = Date.now();
    const response = await this.request[method](url, {
      headers: { ...(this.token ? { 'x-auth-token': this.token } : {}), ...extraHeaders },
      ...(body ? { form: body } : {}),
      failOnStatusCode: false,
    });
    await this.record(method.toUpperCase(), url, body, response, startedAt);
    return response;
  }

  /** Parsed JSON body; a non-JSON body fails with the raw text visible. */
  async json<T = unknown>(response: APIResponse): Promise<T> {
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Expected JSON but got a non-JSON body (status ${response.status()}):\n${text.slice(0, 800)}`);
    }
  }

  /* ----------------------------------------------------------- health */

  healthCheck() {
    return this.send('get', '/health-check');
  }

  /* ------------------------------------------------------------ users */

  register(payload: { name: string; email: string; password: string }) {
    return this.send('post', '/users/register', payload);
  }

  login(payload: { email: string; password: string }) {
    return this.send('post', '/users/login', payload);
  }

  profile() {
    return this.send('get', '/users/profile');
  }

  /** Revokes the current token server-side. */
  logout() {
    return this.send('delete', '/users/logout');
  }

  forgotPassword(email: string) {
    return this.send('post', '/users/forgot-password', { email });
  }

  deleteAccount() {
    return this.send('delete', '/users/delete-account');
  }

  /* ------------------------------------------------------------ notes */

  createNote(payload: { title: string; description: string; category: Category }) {
    return this.send('post', '/notes', payload);
  }

  listNotes() {
    return this.send('get', '/notes');
  }

  getNote(id: string) {
    return this.send('get', `/notes/${encodeURIComponent(id)}`);
  }

  updateNote(id: string, payload: { title: string; description: string; completed: boolean; category: Category }) {
    return this.send('put', `/notes/${encodeURIComponent(id)}`, payload);
  }

  setCompleted(id: string, completed: boolean) {
    return this.send('patch', `/notes/${encodeURIComponent(id)}`, { completed });
  }

  deleteNote(id: string) {
    return this.send('delete', `/notes/${encodeURIComponent(id)}`);
  }

  /** Raw escape hatch for negative tests (bad token, malformed path, …). */
  raw(method: 'get' | 'post' | 'put' | 'patch' | 'delete', endpoint: string, body?: FormBody, headers?: Record<string, string>) {
    return this.send(method, endpoint, body, headers);
  }

  /** Sends a body verbatim — for payloads no well-behaved client would produce (malformed JSON). */
  async rawBody(method: 'post' | 'put' | 'patch', endpoint: string, body: string, contentType: string): Promise<APIResponse> {
    const url = `${API_BASE}${endpoint}`;
    const startedAt = Date.now();
    const response = await this.request[method](url, {
      headers: { ...(this.token ? { 'x-auth-token': this.token } : {}), 'content-type': contentType },
      data: body,
      failOnStatusCode: false,
    });
    await this.record(method.toUpperCase(), url, body, response, startedAt);
    return response;
  }
}

/** Unique-per-call identity so parallel workers never collide on email. */
export function uniqueUser(tag = 'user') {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  return {
    name: 'TestMu SDET Bot',
    email: `testmu.${tag}.${stamp}@example.com`,
    password: `Pw#${stamp.slice(-8)}aA`,
  };
}
