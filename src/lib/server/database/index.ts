import { Database } from 'bun:sqlite';
import { chmodSync, mkdirSync, realpathSync, statSync, openSync, closeSync, lstatSync, readlinkSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export interface DatabaseOptions {
  path: string;
  docsDir?: string;
  production?: boolean;
  deploymentDir?: string;
}

// Resolve existing ancestors too: the database itself need not exist yet.
function canonical(path: string): string {
  const absolute = resolve(path);
  try { return realpathSync(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // A dangling final symlink must be resolved before containment checks.
    try {
      if (lstatSync(absolute).isSymbolicLink()) return canonical(resolve(dirname(absolute), readlinkSync(absolute)));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
    }
    const parent = dirname(absolute);
    if (parent === absolute) throw error;
    return resolve(canonical(parent), relative(parent, absolute));
  }
}
function within(path: string, root: string) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}
export function validateDatabasePath(options: DatabaseOptions): string {
  if (options.production && !isAbsolute(options.path)) throw new Error('Production DATABASE_PATH must be absolute.');
  const path = canonical(options.path);
  if (options.docsDir && within(path, canonical(options.docsDir))) throw new Error('DATABASE_PATH must be outside DOCS_DIR.');
  if (options.production && within(path, canonical(options.deploymentDir ?? process.cwd()))) {
    throw new Error('DATABASE_PATH must be outside the deployment directory.');
  }
  return path;
}
export function openDatabase(options: DatabaseOptions): Database {
  const path = validateDatabasePath(options);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Create with private permissions before SQLite writes any account data.
  const fd = openSync(path, 'a', 0o600);
  closeSync(fd);
  if (!statSync(path).isFile()) throw new Error('DATABASE_PATH must be a file.');
  chmodSync(path, 0o600);
  const db = new Database(path, { strict: true });
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    db.transaction(() => {
      const version = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
      if (version > 1) throw new Error('Unsupported database version.');
      if (version === 0) {
        db.exec(`
          CREATE TABLE users (
            id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin', 'editor')),
            enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)), created_at INTEGER NOT NULL
          );
          CREATE TABLE sessions (
            token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL
          );
          CREATE INDEX sessions_user ON sessions(user_id);
          CREATE INDEX sessions_expiry ON sessions(expires_at);
          CREATE TABLE login_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
          CREATE INDEX login_limits_expiry ON login_limits(expires_at);
          PRAGMA user_version = 1;
        `);
      }
    }).immediate();
    return db;
  } catch (error) { db.close(); throw error; }
}
