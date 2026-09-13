# WikiDocs

A read-only documentation reader built with SvelteKit, Bun, TypeScript,
Tailwind CSS, markdown-it, and Shiki. Pages contain server-rendered HTML and
reflect the current files on every request. Reading does not require JavaScript.
Accounts, editors, directory listings, and Git publishing remain placeholders.

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

The production listener binds plain HTTP on `0.0.0.0` and accepts any hostname.
The launcher clears `ORIGIN` and socket overrides and uses `X-Forwarded-Host`
and `X-Forwarded-Proto` when supplied by the reverse proxy, falling back to the
request Host and the adapter's HTTPS public-origin default. TLS termination stays
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
- `?files` and `?edit` display explicit placeholders; files mode takes precedence.
  Unknown `/_/` service paths return 404. Mutation endpoints remain HTTP 501 stubs.

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
| `DATABASE_PATH` | `./data/wiki.sqlite` | Reserved for future account storage |
| `GIT_REMOTE` / `GIT_BRANCH` | Unset | Reserved for future publishing |

Configuration stays server-side. Browser data contains only the site title,
configuration-presence flag, rendered content, and documentation-relative paths.
Unavailable roots produce a generic 503; unexpected read failures produce a generic
500 with details logged server-side. No content cache is kept across requests.

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
reserved routes, and mutation stubs. It never modifies the configured repository.

Persistent context: `.memory/decisions.md`, `.memory/plan.md`, and
`.memory/rendering.md`. `.memory/scaffolding.md` records the earlier scaffold pass.
