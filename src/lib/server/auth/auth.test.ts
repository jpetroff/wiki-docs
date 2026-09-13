import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, symlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAuthService, hashToken, normalizeLogin, validLogin, validPassword, SESSION_SECONDS, authorize, type AuthService, type AuthResult } from './index';
import { openDatabase, validateDatabasePath } from '../database';
import { safeReturnTo, readLoginForm, requireOrigin } from './http';

let scratch: string;
let services: AuthService[];
const password = 'a long test password';
function ok<T>(result: AuthResult<T>): T { expect(result.status).toBe('ok'); if (result.status !== 'ok') throw new Error('Expected success'); return result.value; }
function service(options: Parameters<typeof createAuthService>[1] = {}) {
  const auth = createAuthService({ path: join(scratch, 'accounts.sqlite') }, options);
  services.push(auth);
  return auth;
}
beforeEach(() => { scratch = mkdtempSync(join(tmpdir(), 'wiki-auth-')); services = []; });
afterEach(() => { for (const auth of services) auth.close(); rmSync(scratch, { recursive: true, force: true }); });

test('username normalization and password policy preserve spaces', () => {
  expect(normalizeLogin('  MiXeD.Name ')).toBe('mixed.name');
  for (const input of ['ab', 'a b', 'a/b', 'éabc', 'a'.repeat(65)]) expect(validLogin(input)).toBe(false);
  expect(validLogin('abc._-123')).toBe(true);
  expect(validPassword('x'.repeat(14))).toBe(false);
  expect(validPassword('x'.repeat(128))).toBe(true);
  expect(validPassword('x'.repeat(129))).toBe(false);
  expect(validPassword(' '.repeat(15))).toBe(true);
});

test('bootstrap, duplicate users, credentials and hashed opaque tokens', async () => {
  const auth = service();
  const user = ok(await auth.create(' Admin ', password, 'admin', true));
  expect(user.login).toBe('admin');
  expect((await auth.create('other', password, 'admin', true)).status).toBe('conflict');
  expect((await auth.create('ADMIN', password, 'editor')).status).toBe('conflict');
  expect((await auth.create('invalid user', password, 'editor')).status).toBe('validation-error');
  expect((await auth.create('other', 'short', 'editor')).status).toBe('validation-error');
  const session = ok(await auth.login(' ADMIN ', password));
  expect(session.token).toMatch(/^[a-f0-9]{64}$/);
  expect(ok(await auth.lookupSession(session.token))?.user).toEqual(user);
  const db = openDatabase({ path: join(scratch, 'accounts.sqlite') });
  try {
    const stored = db.query('SELECT token_hash FROM sessions').get() as { token_hash: string };
    expect(stored.token_hash).toBe(hashToken(session.token));
    expect(stored.token_hash).not.toBe(session.token);
    expect((db.query('SELECT password_hash FROM users').get() as { password_hash: string }).password_hash).toStartWith('$argon2id$');
    expect(statSync(join(scratch, 'accounts.sqlite')).mode & 0o777).toBe(0o600);
  } finally { db.close(); }
  expect((await auth.login('admin', 'incorrect long password')).status).toBe('invalid-credentials');
  expect((await auth.login('unknown', password)).status).toBe('invalid-credentials');
});

test('sessions survive reopening, expire after exactly 30 days, and logout is idempotent', async () => {
  let time = Date.now();
  let auth = service({ now: () => time });
  ok(await auth.create('editor', password, 'editor'));
  const first = ok(await auth.login('editor', password));
  const second = ok(await auth.login('editor', password));
  auth.close();
  auth = service({ now: () => time });
  expect(ok(await auth.lookupSession(first.token))?.user.login).toBe('editor');
  ok(await auth.logout(first.token));
  ok(await auth.logout(first.token));
  ok(await auth.logout(undefined));
  expect(ok(await auth.lookupSession(first.token))).toBeNull();
  expect(ok(await auth.lookupSession('malformed'))).toBeNull();
  time += SESSION_SECONDS * 1000 - 1;
  expect(ok(await auth.lookupSession(second.token))).not.toBeNull();
  time++;
  expect(ok(await auth.lookupSession(second.token))).toBeNull();
});

test('reset revokes all sessions and disabled users cannot authenticate', async () => {
  const auth = service();
  const user = ok(await auth.create('editor', password, 'editor'));
  const first = ok(await auth.login('editor', password));
  const second = ok(await auth.login('editor', password));
  ok(await auth.resetPassword('editor', 'another long password'));
  expect(ok(await auth.lookupSession(first.token))).toBeNull();
  expect(ok(await auth.lookupSession(second.token))).toBeNull();
  expect((await auth.login('editor', password)).status).toBe('invalid-credentials');
  const next = ok(await auth.login('editor', 'another long password'));
  const db = openDatabase({ path: join(scratch, 'accounts.sqlite') });
  db.query('UPDATE users SET enabled = 0 WHERE id = ?').run(user.id);
  db.close();
  expect(ok(await auth.lookupSession(next.token))).toBeNull();
  expect((await auth.login('editor', 'another long password')).status).toBe('invalid-credentials');
});

test('password reset during verification prevents issuing a stale session', async () => {
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const auth = service({ verify: async (value, hash) => { const matches = await Bun.password.verify(value, hash); entered(); await gate; return matches; } });
  ok(await auth.create('editor', password, 'editor'));
  const pending = auth.login('editor', password);
  await started;
  ok(await auth.resetPassword('editor', 'a replacement password'));
  release();
  expect((await pending).status).toBe('invalid-credentials');
});

test('per-user limits persist across restarts and expire', async () => {
  let time = Date.now();
  let auth = service({ now: () => time, verify: async () => false });
  for (let i = 0; i < 5; i++) expect((await auth.login('missing', password)).status).toBe('invalid-credentials');
  auth.close();
  auth = service({ now: () => time, verify: async () => false });
  expect(await auth.login(' MISSING ', password)).toEqual({ status: 'throttled', retryAfter: 900 });
  time += 900_000;
  expect((await auth.login('missing', password)).status).toBe('invalid-credentials');
});

test('global throttling applies across different usernames before verification', async () => {
  let calls = 0;
  const auth = service({ verify: async () => { calls++; return false; } });
  for (let i = 0; i < 60; i++) await auth.login(`missing-${i}`, password);
  expect((await auth.login('another', password)).status).toBe('throttled');
  expect(calls).toBe(60);
});

test('authorization distinguishes anonymous, editor and admin', () => {
  const editor = { user: { id: '1', login: 'editor', role: 'editor' as const }, expiresAt: '' };
  const admin = { ...editor, user: { ...editor.user, role: 'admin' as const } };
  expect(authorize('edit', null).status).toBe('unauthorized');
  expect(authorize('manage-users', editor).status).toBe('forbidden');
  expect(authorize('publish', editor).status).toBe('ok');
  expect(authorize('manage-users', admin).status).toBe('ok');
});

test('storage is lazy and unavailable failures are explicit', async () => {
  const auth = createAuthService({ path: '/dev/null/accounts.sqlite' });
  expect(ok(await auth.lookupSession(undefined))).toBeNull();
  expect((await auth.login('editor', password)).status).toBe('unavailable');
  auth.close();
});

test('migrations are idempotent and reject newer schemas', () => {
  const options = { path: join(scratch, 'accounts.sqlite') };
  let db = openDatabase(options);
  db.close();
  db = openDatabase(options);
  expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1);
  db.exec('PRAGMA user_version = 2');
  db.close();
  expect(() => openDatabase(options)).toThrow('Unsupported database version');
});

test('production paths reject docs, deployments and symlink equivalents without creating data', () => {
  const docs = join(scratch, 'docs');
  const deploy = join(scratch, 'deploy');
  mkdirSync(docs); mkdirSync(deploy);
  symlinkSync(docs, join(scratch, 'alias'));
  symlinkSync(join(docs, 'not-created.sqlite'), join(scratch, 'dangling.sqlite'));
  for (const path of ['relative.sqlite', join(docs, 'db.sqlite'), join(deploy, 'db.sqlite'), join(scratch, 'alias/db.sqlite'), join(scratch, 'dangling.sqlite')]) {
    expect(() => validateDatabasePath({ path, docsDir: docs, production: true, deploymentDir: deploy })).toThrow();
  }
  expect(validateDatabasePath({ path: join(scratch, 'safe/db.sqlite'), docsDir: docs, production: true, deploymentDir: deploy })).toBe(join(scratch, 'safe/db.sqlite'));
});

describe('HTTP helpers', () => {
  test.each(['https://evil.test', '//evil.test', '/\\evil.test', '/%5cevil.test', '/%2f%2fevil.test', '/_/login', '/_/logout?x=1', '/a/../_/login', '/%255f/login', '/%0aevil', '/bad%'])('rejects unsafe return path %s', (path) => {
    expect(safeReturnTo(path)).toBe('/');
  });
  test('preserves local paths, queries and fragments', () => {
    expect(safeReturnTo('/guide.md?edit#heading')).toBe('/guide.md?edit#heading');
    expect(safeReturnTo('/guide%20name.md')).toBe('/guide%20name.md');
  });
  test('requires same origin and bounded urlencoded bodies', async () => {
    const url = new URL('https://wiki.test/_/login');
    expect(() => requireOrigin({ url, request: new Request(url, { method: 'POST' }) })).toThrow();
    expect(() => requireOrigin({ url, request: new Request(url, { method: 'POST', headers: { origin: 'https://evil.test' } }) })).toThrow();
    expect(() => requireOrigin({ url, request: new Request(url, { method: 'POST', headers: { origin: url.origin } }) })).not.toThrow();
    const form = await readLoginForm(new Request(url, { method: 'POST', body: new URLSearchParams({ login: 'editor', password }) }));
    expect(form.get('password')).toBe(password);
    await expect(readLoginForm(new Request(url, { method: 'POST', body: new URLSearchParams({ login: 'x'.repeat(8193) }) }))).rejects.toThrow();
  });
});
