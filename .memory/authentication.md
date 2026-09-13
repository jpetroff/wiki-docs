# Username/password login foundation

Implemented 2026-09-13. Public reading stays public; no actual editing, publishing,
browser account administration, self-registration, or password recovery was added.

## Runtime and boundaries

- `src/lib/server/auth/index.ts` is a framework-independent service factory shared
  by the CLI and SvelteKit. `runtime.ts` lazily supplies private app config.
- SQLite users/sessions/login_limits have a versioned transactional migration,
  prepared statements, WAL, foreign keys, busy timeout, and owner-only data files.
- Username: trim/lowercase, 3–64 ASCII letters/digits/dot/underscore/hyphen.
  Password: 15–128 Unicode characters, spaces preserved, async Argon2id (64 MiB,
  time cost 2). Passwords and hashes never enter page data or logs.
- Sessions: random 32-byte hex token, only SHA-256 token hash in SQLite, fixed
  30-day expiry. HttpOnly, host-only, SameSite=Lax, Path=/; Secure on HTTPS.
- Hook validates cookies into locals; layout projects only public user fields.
  Public assets skip auth lookup. Missing cookie avoids storage entirely.
  Storage errors fail protected operations with 503 while public reading works.
- Login uses an 8 KiB bounded urlencoded form body, matching Origin, generic
  invalid credentials, dummy verification for unknown accounts, and validated
  local return paths. Progressive enhancement uses the existing SvelteKit form
  action contract. No-JavaScript forms work. Logout is POST-only and idempotent.
- Persistent limits count attempts before verification: five per normalized
  username / 15 minutes and 60 global / minute; 429 includes Retry-After.
  Login attempts prune expired limit/session rows.
- Settings requires admin; Publish and edit mode require admin/editor. Protected
  page requests redirect anonymous users to login; mutations return 401/403.
  Authorized feature mutations still return 501. Files-mode precedence remains.
- Password reset updates the hash and deletes all user sessions in one transaction.
  Login rechecks enabled state and the verified hash after async verification.

## Operator workflow

`bun run accounts -- bootstrap`, `create <username> --role admin|editor`, and
`reset-password <username>` require an interactive terminal and masked prompts with
confirmation. Bootstrap refuses once any account exists. CLI is bundled as
accounts.js in production alongside check-database-path.js.

Production DATABASE_PATH must be absolute and outside DOCS_DIR and BUILD_DIR,
including dangling or existing symlink equivalents. Deployment validates both
source production config and the copied config before stopping/replacing output.
The launcher validates before starting. Development keeps ./data/wiki.sqlite.
The bundled CLI detects its production artifact and validates against its own
location; invoke it from the deployment directory with NODE_ENV=production so Bun
loads the copied production env files. SvelteKit runtime uses `$app/environment`
`dev` rather than process.env.NODE_ENV because the Bun adapter can inline the
latter incorrectly during bundling.

README describes trusted proxy headers, setup, reset, backup/restore and storage
failure behavior. Live deployments and actual documentation/account data were not
modified during implementation.

## Verification

- 112 unit/integration tests passed, including bundled CLI pseudo-terminal tests
  that detect password echo, account/reset races, persistence, throttling, migration
  idempotence, and unsafe deployment rejection before output replacement.
- Svelte check and production build passed. The adapter reports bun:sqlite as an
  unresolved external dependency; production HTTP checks confirm Bun resolves it.
- Focused existing HTTP smoke suite passed in development and production, checking
  native form login/logout, authorization, CSRF, cookie flags on HTTP/proxied HTTPS,
  session survival after a server restart, public reads during DB failure, and all
  existing reader fixtures. Sandbox local-port access was required for this suite.
