/**
 * Pre-flight: confirms the system under test is reachable and that the API
 * contract still matches what the suite assumes.
 *
 * Worth running first — a public practice target can change, and one contract
 * drift here is much faster to diagnose than twenty red tests.
 *
 * Run with: npm run verify:target
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const API = (process.env.API_BASE_URL ?? 'https://practice.expandtesting.com/notes/api').replace(/\/$/, '');
const UI = (process.env.BASE_URL ?? 'https://practice.expandtesting.com/notes/app').replace(/\/$/, '');

let failures = 0;
const ok = (label: string, detail = '') => console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
const bad = (label: string, detail = '') => {
  failures++;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
};

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, any> | null };
}

async function main(): Promise<void> {
  console.log(`\nUI   ${UI}\nAPI  ${API}\n`);

  try {
    const res = await fetch(`${UI}/login`, { signal: AbortSignal.timeout(20_000) });
    res.ok ? ok('UI login page', `HTTP ${res.status}`) : bad('UI login page', `HTTP ${res.status}`);
  } catch (e) {
    bad('UI login page', (e as Error).message);
  }

  try {
    const health = await call('GET', '/health-check');
    health.body?.success ? ok('GET /health-check', health.body.message) : bad('GET /health-check', JSON.stringify(health.body));
  } catch (e) {
    bad('GET /health-check', (e as Error).message);
    console.log('\nAPI unreachable — skipping contract checks.\n');
    process.exit(1);
  }

  const user = { name: 'Target Verifier', email: `verify.${Date.now()}@example.com`, password: 'SuperSecret#2026' };
  try {
    const reg = await call('POST', '/users/register', user);
    reg.status === 201 ? ok('POST /users/register', '201') : bad('POST /users/register', `HTTP ${reg.status}`);

    const login = await call('POST', '/users/login', { email: user.email, password: user.password });
    const token = login.body?.data?.token as string | undefined;
    token ? ok('POST /users/login', 'token at data.token') : bad('POST /users/login', `no data.token in ${JSON.stringify(login.body).slice(0, 200)}`);
    if (!token) throw new Error('no token');

    const notes = await call('GET', '/notes', undefined, token);
    notes.status === 200 ? ok('GET /notes with x-auth-token', '200') : bad('GET /notes', `HTTP ${notes.status} — auth header may have changed`);

    const created = await call('POST', '/notes', { title: 'Contract check', description: 'verify-target', category: 'Work' }, token);
    const fields = Object.keys(created.body?.data ?? {}).sort().join(',');
    const expected = 'category,completed,created_at,description,id,title,updated_at,user_id';
    fields === expected ? ok('POST /notes shape', fields) : bad('POST /notes shape', `got [${fields}], expected [${expected}]`);

    const logout = await call('DELETE', '/users/logout', undefined, token);
    const reuse = await call('GET', '/notes', undefined, token);
    logout.status === 200 && reuse.status === 401
      ? ok('DELETE /users/logout revokes token')
      : bad('DELETE /users/logout', `logout ${logout.status}, reuse ${reuse.status}`);

    const relogin = await call('POST', '/users/login', { email: user.email, password: user.password });
    await call('DELETE', '/users/delete-account', undefined, relogin.body?.data?.token);
    ok('Cleanup', 'verification account deleted');
  } catch (e) {
    if ((e as Error).message !== 'no token') bad('API contract smoke', (e as Error).message);
  }

  console.log(failures === 0 ? '\nTarget looks good. Run `npm test`.\n' : `\n${failures} check(s) failed — see README "If the target has changed".\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
