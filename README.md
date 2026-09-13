# WikiDocs

A read-only documentation reader built with SvelteKit, Bun, TypeScript,
Tailwind CSS, markdown-it, and Shiki. Pages contain server-rendered HTML and
reflect the current files on every request. Reading does not require JavaScript.
Username/password login and local account administration are available. Editors,
directory listings, browser account management, and Git publishing remain placeholders.

## Run locally

Requires Bun 1.4 or newer.

```sh
bun install --frozen-lockfile
bun run dev
```

Set `DOCS_DIR` in `.env` to the absolute path of an existing documentation folder.
The application never creates, clones, or modifies that folder. Builds and startup
work without it; documentation requests then return HTTP 503.

For a background production instance alongside development:

```sh
make build
make status
make stop
make start
make reload
```

`BUILD_DIR` and `PORT` are defined in `Makefile`, defaulting to `/home/eugene/www`
and `8080`. Override them on any command, for example
`make build BUILD_DIR=/tmp/wiki-site PORT=8081`. Use the same overrides for
subsequent lifecycle commands. These scripts require Linux, Bash, Bun, `flock`,
`setsid`, and `curl`, and run the server as the invoking user.

Every successful `make build` bundles the server, runtime dependencies, and
static assets directly into `BUILD_DIR`, then starts the background instance.
The existing instance stays available during compilation. Once the build succeeds,
it is stopped, the directory contents are replaced, and the new build starts.
This causes a brief interruption. There are no versioned releases or rollback;
a compilation failure leaves the existing instance running.

Use a dedicated deployment directory: its contents are replaced on every build,
except the process lock files and `instance.log`, which keeps appended logs.
The old `releases/` directory and `current` symlink are removed automatically.
`make status` reports the PID and port, returning exit status 1 when stopped.

The build snapshots `.env`, `.env.local`, and `.env.production` into `BUILD_DIR`
with owner-only permissions. Rebuild to pick up configuration changes. Keep
persistent data outside `BUILD_DIR` and configure it with absolute paths.
The server runs with `BUILD_DIR` as its working directory. No source checkout or
`node_modules` is needed by the deployed server. `bun run dev` continues to use
its own development port and source files.

Production account storage requires an absolute `DATABASE_PATH` outside both
`DOCS_DIR` and `BUILD_DIR`, for example `/home/eugene/wiki-data/wiki.sqlite`.
Deployment validates the production environment before stopping the server or
replacing files, including paths through symlinks. The default relative database
path is for development only. Configure this before the first `make build`.

The production listener binds plain HTTP on `0.0.0.0` and accepts any hostname.
The launcher clears `ORIGIN` and socket overrides and uses `X-Forwarded-Host`
and `X-Forwarded-Proto` when supplied by the reverse proxy, falling back to the
request Host and the adapter's HTTPS public-origin default. The trusted proxy must overwrite both forwarded headers, and direct access to the
production listener should be restricted to that proxy. TLS termination stays
at the proxy; no public hostname or certificate configuration is needed here.
The background process survives closing the terminal; automatic boot startup
or crash recovery is not provided.

You can also invoke `bash scripts/instance.sh {start|status|stop|reload}
[build-directory] [port]` directly. `bun run build` still produces the usual
local `build/` output without deploying it.

## Reading and URLs

- `/` and directory URLs display the exact `README.md`, or return HTTP 404.
  Directory URLs work with and without trailing slashes.
- File URLs mirror actual filenames and retain extensions. Allowed extensions:
  `.md`, `.sh`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`, `.py`, and `.tf`.
  Markdown renders as HTML; other allowed UTF-8 text files show highlighted source.
  Scripts are displayed, never executed. Extension matching is case-sensitive.
- Extensionless paths try `.md`, `.sh`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`,
  `.py`, then `.tf`, in that order. Exact paths take precedence: directories still
  require their README. Explicit extensions and trailing-slash paths do not fall
  back to other filenames. Links resolve relative to the actual matched source.
- Relative links resolve against the source document's directory. For example,
  `../setup.md#install` in `guide/README.md` links to the root `setup.md` heading.
  Root-relative paths, queries, encoded filenames, and external URLs are supported.
  Document anchor IDs and internal fragment links use the `user-content-` prefix.
- Local PNG, JPEG, GIF, WebP, and AVIF references are rewritten to
  `/_/assets/<documentation-relative-path>`. The endpoint supports GET and HEAD.
  SVG and arbitrary downloads are not supported. Remote images are not proxied.
- Missing files, directories without README, unsupported types, hidden paths,
  traversal, and symlinks outside the documentation root return 404.
  Internal symlinks must resolve to visible, allowed files.
- `?files` and authorized `?edit` requests display explicit placeholders; files mode
  takes precedence. Edit/Publish require an editor or administrator; Settings
  requires an administrator. Anonymous protected page requests redirect to login.
  Unknown `/_/` service paths return 404. Document/account-management/publishing
  mutations return 401/403 without permission and remain HTTP 501 stubs when authorized.

## Markdown and highlighting

markdown-it handles headings, emphasis, lists, blockquotes, tables, strikethrough,
links, images, inline code, and fenced/indented code. Embedded documentation HTML,
including `details` and `summary`, is sanitized with rehype-sanitize. Author styles,
scripts, event handlers, and unsafe URL schemes are removed. Markdown table
alignment is preserved. Trusted Shiki highlighting is applied after sanitization.

The shared highlighting configuration defines language aliases, source-extension
mappings, and the GitHub dark theme. The reader uses one lazy server highlighter;
future editor adapters must consume the same configuration. Unknown languages
fall back to literal plain text. The current client bundle includes no editor,
Markdown parser, or Shiki engine. The app is dark-only, using shadcn/ui neutral
tokens for surfaces and controls. Dark styling and native controls apply from the
initial HTML, independent of system preferences or JavaScript; there is no theme toggle.

Code blocks and source pages gain a Copy button after hydration. Copying preserves
whitespace and reports success or failure; an HTTP fallback supports browsers
without the Clipboard API. Inline code remains unchanged.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DOCS_DIR` | Unset | Absolute path to existing documentation |
| `SITE_TITLE` | `WikiDocs` | Public site title |
| `ORIGIN` | Unset | Public origin for SvelteKit/Bun |
| `DATABASE_PATH` | `./data/wiki.sqlite` | SQLite accounts/sessions; production requires an absolute path outside docs and deployment |
| `GIT_REMOTE` / `GIT_BRANCH` | Unset | Reserved for future publishing |

Configuration stays server-side. Browser data contains only the site title,
configuration-presence flag, rendered content, documentation-relative paths, and
the signed-in user’s ID, username, and role. Password hashes, session tokens, and
absolute storage paths are never serialized into page data.
Unavailable roots produce a generic 503; unexpected read failures produce a generic
500 with details logged server-side. No content cache is kept across requests.

## Accounts and login

Reading documents and images is public. Create the first administrator locally:

```sh
bun run accounts -- bootstrap
bun run accounts -- create alice --role editor
bun run accounts -- reset-password alice
```

These commands use the same `DATABASE_PATH` and `DOCS_DIR` environment as the app.
They require an interactive terminal, prompt for passwords without echo, and ask
for confirmation. Bootstrap refuses once any account exists. Additional accounts
require an explicit `admin` or `editor` role. There are no default credentials,
self-registration, or browser password-reset/account-management screens.

Usernames are trimmed and lowercased, and must contain 3–64 ASCII letters, digits,
dots, underscores, or hyphens. Passwords contain 15–128 Unicode characters;
spaces count and are preserved. Passwords use Argon2id. Resetting a password
immediately revokes all sessions for that account.

The production deployment includes a standalone account command. Run it from the
deployment directory so Bun loads the copied production environment:

```sh
cd /home/eugene/www
NODE_ENV=production bun accounts.js bootstrap
NODE_ENV=production bun accounts.js create alice --role editor
NODE_ENV=production bun accounts.js reset-password alice
```

The bundled command always enforces production path restrictions. It needs only
Bun and the deployment environment files, with no source checkout or dependencies.

Log in at `/_/login`. Sessions persist across browser and server restarts and expire
exactly 30 days after login; activity does not extend them. Logout revokes the
current session. Cookies are HttpOnly, SameSite=Lax, and Secure when the public
request uses HTTPS. HTTP development works without Secure cookies. Login/logout
require matching Origin headers, and login return destinations must be local paths.

SQLite holds only hashes of opaque session tokens. Login attempts are limited to
five per normalized username per 15 minutes and 60 globally per minute, including
successful attempts. Limits persist across restarts. A 429 response includes
`Retry-After`. Expired session and throttle records are cleaned up on login attempts.
Anonymous reads do not initialize the database. Storage failures leave public
reading available and return generic 503 responses for authentication/protected
operations instead of granting access. Account-storage failures are logged without
credentials or private configuration.

Database files are created with owner-only access, with private new parent
directories. Keep the database and its SQLite `-wal`/`-shm` sidecars outside the
content and deployment folders. To back up consistently, stop the instance, copy
the database and any remaining sidecars together to private backup storage, then
restart it. Stop the instance before restoring the same set. A restored backup
also restores its account/session state; reset passwords to revoke restored sessions
when needed. Builds never migrate data during compilation; account operations
apply versioned migrations on first use.

## Validation

```sh
bun test
bun run check
bun run build
bun run test:smoke
```

Unit tests cover resolution, containment, URLs, Markdown, sanitization, and source
preservation. The smoke suite starts isolated development/production servers and
uses temporary documentation fixtures to check SSR, updates, images, errors,
reserved routes, login/logout, proxy cookie flags, authorization, session persistence,
and storage-failure behavior. CLI tests use temporary pseudo-terminals to check
bootstrap/create/reset without echoing passwords and unsafe deployment rejection. It never modifies the configured repository.

Persistent context: `.memory/decisions.md`, `.memory/plan.md`, and
`.memory/rendering.md`. `.memory/scaffolding.md` records the earlier scaffold pass.
