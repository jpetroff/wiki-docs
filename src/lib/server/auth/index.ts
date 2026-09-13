import type { Database } from 'bun:sqlite';
import { openDatabase, type DatabaseOptions } from '../database';

export interface User { id: string; login: string; role: 'admin' | 'editor' }
export interface Session { user: User; expiresAt: string }
export type Permission = 'edit' | 'publish' | 'manage-users';
export type AuthResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'invalid-credentials' | 'unauthorized' | 'forbidden' | 'conflict' | 'not-found' | 'unavailable' }
  | { status: 'validation-error'; message: string }
  | { status: 'throttled'; retryAfter: number };
interface UserRow extends User { password_hash: string; enabled: number }
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const normalizeLogin = (login: string) => login.trim().toLowerCase();
export const validLogin = (login: string) => /^[a-z0-9._-]{3,64}$/.test(login);
export const validPassword = (password: string) => [...password].length >= 15 && [...password].length <= 128;
export const hashToken = (token: string) => new Bun.CryptoHasher('sha256').update(token).digest('hex');
const publicUser = (row: UserRow): User => ({ id: row.id, login: row.login, role: row.role });
export function authorize(permission: Permission, session: Session | null): AuthResult<User> {
  if (!session) return { status: 'unauthorized' };
  if (permission === 'manage-users' && session.user.role !== 'admin') return { status: 'forbidden' };
  return { status: 'ok', value: session.user };
}

export function createAuthService(options: DatabaseOptions, dependencies: {
  now?: () => number;
  verify?: (password: string, hash: string) => Promise<boolean>;
} = {}) {
  let database: Database | undefined;
  const db = () => database ??= openDatabase(options);
  const now = dependencies.now ?? Date.now;
  const verify = dependencies.verify ?? ((password, hash) => Bun.password.verify(password, hash));
  let dummyHash: Promise<string> | undefined;
  const passwordHash = (password: string) => Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 2 });
  async function guarded<T>(operation: () => T | Promise<T>): Promise<T | { status: 'unavailable' }> {
    try { return await operation(); }
    catch { console.error('Account storage operation failed.'); return { status: 'unavailable' }; }
  }
  const findUser = (login: string) => db().query('SELECT * FROM users WHERE login = ?').get(login) as UserRow | null;
  const throttle = (login: string): AuthResult<void> => db().transaction((): AuthResult<void> => {
    const time = now();
    db().query('DELETE FROM login_limits WHERE expires_at <= ?').run(time);
    db().query('DELETE FROM sessions WHERE expires_at <= ?').run(time);
    const limits = [{ key: 'global', max: 60, window: 60_000 }, { key: `user:${login}`, max: 5, window: 900_000 }];
    let retryAfter = 0;
    for (const limit of limits) {
      const row = db().query('SELECT attempts, expires_at FROM login_limits WHERE key = ?').get(limit.key) as { attempts: number; expires_at: number } | null;
      if (row && row.attempts >= limit.max) retryAfter = Math.max(retryAfter, Math.ceil((row.expires_at - time) / 1000));
    }
    if (retryAfter) return { status: 'throttled', retryAfter };
    for (const limit of limits) db().query(`INSERT INTO login_limits VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1`).run(limit.key, time + limit.window);
    return { status: 'ok', value: undefined };
  }).immediate();

  return {
    close() { database?.close(); database = undefined; },
    authorize,
    async lookupSession(token: string | undefined): Promise<AuthResult<Session | null>> {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return { status: 'ok', value: null };
      return guarded(() => {
        const row = db().query(`SELECT users.*, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id
          WHERE token_hash = ? AND expires_at > ? AND enabled = 1`).get(hashToken(token), now()) as (UserRow & { expires_at: number }) | null;
        return { status: 'ok' as const, value: row ? { user: publicUser(row), expiresAt: new Date(row.expires_at).toISOString() } : null };
      });
    },
    async login(input: string, password: string): Promise<AuthResult<Session & { token: string }>> {
      const login = normalizeLogin(input);
      if (!validLogin(login) || !validPassword(password)) return { status: 'invalid-credentials' };
      return guarded(async () => {
        const allowed = throttle(login);
        if (allowed.status !== 'ok') return allowed;
        const row = findUser(login);
        const hash = row?.password_hash ?? await (dummyHash ??= passwordHash(crypto.randomUUID()));
        const matches = await verify(password, hash);
        if (!row || !matches || !row.enabled) return { status: 'invalid-credentials' as const };
        return db().transaction((): AuthResult<Session & { token: string }> => {
          const current = findUser(login);
          if (!current?.enabled || current.password_hash !== hash) return { status: 'invalid-credentials' };
          const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
          const expires = now() + SESSION_SECONDS * 1000;
          db().query('INSERT INTO sessions VALUES (?, ?, ?)').run(hashToken(token), current.id, expires);
          return { status: 'ok', value: { user: publicUser(current), expiresAt: new Date(expires).toISOString(), token } };
        }).immediate();
      });
    },
    async logout(token: string | undefined): Promise<AuthResult<void>> {
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return { status: 'ok', value: undefined };
      return guarded(() => {
        db().query('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
        return { status: 'ok' as const, value: undefined };
      });
    },
    async create(input: string, password: string, role: User['role'], bootstrap = false): Promise<AuthResult<User>> {
      const login = normalizeLogin(input);
      if (!validLogin(login)) return { status: 'validation-error', message: 'Username must contain 3–64 letters, digits, dots, underscores, or hyphens.' };
      if (!validPassword(password)) return { status: 'validation-error', message: 'Password must contain 15–128 characters.' };
      if (!['admin', 'editor'].includes(role) || (bootstrap && role !== 'admin')) return { status: 'validation-error', message: 'Invalid role.' };
      return guarded(async () => {
        const hash = await passwordHash(password);
        return db().transaction((): AuthResult<User> => {
          if ((bootstrap && db().query('SELECT 1 FROM users LIMIT 1').get()) || findUser(login)) return { status: 'conflict' };
          const user = { id: crypto.randomUUID(), login, role };
          db().query('INSERT INTO users (id, login, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, login, hash, role, now());
          return { status: 'ok', value: user };
        }).immediate();
      });
    },
    async resetPassword(input: string, password: string): Promise<AuthResult<void>> {
      if (!validPassword(password)) return { status: 'validation-error', message: 'Password must contain 15–128 characters.' };
      return guarded(async () => {
        const hash = await passwordHash(password);
        return db().transaction((): AuthResult<void> => {
          const user = findUser(normalizeLogin(input));
          if (!user) return { status: 'not-found' };
          db().query('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
          db().query('DELETE FROM sessions WHERE user_id = ?').run(user.id);
          return { status: 'ok', value: undefined };
        }).immediate();
      });
    }
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
