# WikiDocs

A wiki-style documentation engine built with SvelteKit, Tailwind CSS,
shadcn-svelte, Bun, and Vite.

**Current state: first-pass scaffold.** The app starts and serves placeholder
pages. Request classification and server service boundaries exist; Markdown
rendering, filesystem access, accounts, editing, SQLite, and Git operations are
not implemented. No documentation repository or credentials are needed to run it.

## Run locally

Requires Bun 1.4 or newer.

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:5173. The scaffold works without an `.env` file.
Optionally copy `.env.example` to `.env` and customize the site title and future
documentation location. No folders or database files are created by the app.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Vite development server running under Bun |
| `bun run check` | Generate SvelteKit types and check Svelte/TypeScript |
| `bun test` | Request-classification tests |
| `bun run build` | Vite production build using the Bun adapter |
| `bun run start` | Run the built Bun server; default port 3000 |
| `bun run test:smoke` | Check real development and production HTTP routes; build first |

For a local production run:

```sh
bun run build
ORIGIN=http://localhost:3000 bun run start
```

Set `ORIGIN` to the actual public origin when deploying. `HOST` and `PORT` control
the production listener. Install build dependencies before building; retain the
application dependencies for the built server.

## Configuration

All configuration is read server-side. Only the site title and a boolean
indicating whether a documentation folder was configured reach the browser.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DOCS_DIR` | Unset | Existing documentation folder on this host; future content root |
| `DATABASE_PATH` | `./data/wiki.sqlite` | Future SQLite file, outside the documentation root |
| `SITE_TITLE` | `WikiDocs` | Site title |
| `ORIGIN` | Unset | Public origin used by SvelteKit/Bun adapter |
| `GIT_REMOTE` | Unset | Future Git remote override; otherwise use checkout upstream |
| `GIT_BRANCH` | Unset | Future Git branch override; never switch or clone automatically |

Use an absolute `DOCS_DIR`. Relative database paths will be relative to the server's
working directory. In this pass configuration is descriptive only: it does not
trigger filesystem reads, database initialization, or Git commands.

## Scaffold routes

- `/` and any documentation path: read placeholder.
- `/guide/intro.md?edit`: editor placeholder, not a functioning editor.
- `/guide/?files`: file-list placeholder. `?files` wins over `?edit`.
- `/_/login`, `/_/settings`, `/_/publish`: service placeholder pages.
- POST to login/settings/publish: form-action stubs returning HTTP 501.
- POST `/_/logout` and POST/PUT/PATCH/DELETE `/_/api/documents`: JSON stubs returning
  HTTP 501. These do not read request bodies or perform mutations.
- Unknown `/_/` routes return 404 rather than falling through to documentation.
- Production application assets use `/_/app/`.

Page placeholders return 200 so the scaffold is navigable. Domain results explicitly
say `not-implemented`; no successful authentication, file read, or save is implied.
The login inputs and feature buttons are disabled. Raw mutation requests still
return 501. SvelteKit may reject a cross-origin form request earlier with 403.

## Architecture and next steps

`hooks.server.ts` classifies requests. Thin SvelteKit routes delegate to the server
routing layer, which separates authorization, resource resolution, and execution.
Server-only modules provide typed stubs for documentation, Markdown, accounts,
database initialization, and Git. Shared types contain no server configuration.

The installed Blok and Markdown packages are reserved for later passes and are not
imported by the current application. Generated shadcn components live in
`src/lib/components/ui`; `components.json` records their registry configuration.

Persistent implementation context:

- [.memory/plan.md](.memory/plan.md): full product roadmap and staged delivery.
- [.memory/decisions.md](.memory/decisions.md): agreed behavior and constraints.
- [.memory/scaffolding.md](.memory/scaffolding.md): module map, contracts, and checks.

The next pass is read-only documentation resolution and rendering. Accounts,
editing, and Git publishing follow separately.
