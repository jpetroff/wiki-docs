# First-pass scaffold handoff

## Implementation boundary

Implemented: installed packages and Bun lockfile, Bun/Vite commands, SvelteKit
SSR shell, generated shadcn Button/Input/Card components, configuration loading,
request classification, domain interfaces/stubs, thin route wiring, HTTP 501
mutation responses, and reserved-service 404s. The app can start with no DOCS_DIR.

Not implemented: documentation disk access, Markdown rendering, asset file serving,
README discovery, real listings, sessions/passwords/accounts, SQLite initialization,
Blok mounting/conversion, document saves, pending-change storage, and Git commands.
All unfinished domain methods return an explicit not-implemented result. Never
interpret the navigable placeholder pages or installed libraries as working features.

## Installed stack

- Bun 1.4.0 used for verification; native SQLite/password APIs reserved for later.
- Svelte 5, SvelteKit 2, Vite 8, svelte-adapter-bun 1.0.1.
- TypeScript 5.9.3 satisfies the shared peer range of the Bun adapter, SvelteKit,
  and svelte-check. TypeScript 7 was not compatible with those declared ranges.
- Tailwind 4 and its Vite plugin; shadcn-svelte 1.6.1-generated components,
  neutral/nova preset, local Roboto font, class merging and variant helpers.
  The CLI's preset is `a2r6bw`; it generates a lime primary accent and neutral
  surfaces. `components.json` is the source of truth for subsequent component adds.
- @bloklabs/core 1.13.0 installed, but not imported anywhere in application code.
- unified, remark-parse, remark-gfm, remark-rehype, rehype-sanitize, and
  rehype-stringify installed for the read-only Markdown pass; no pipeline yet.
- bun.lock captures exact dependency resolution. Use frozen installs to reproduce.

## Folder responsibilities

| Location | Responsibility |
| --- | --- |
| `src/lib/components/ui/` | Generated shadcn Svelte components |
| `src/lib/shared/` | Serializable request modes and domain result union |
| `src/lib/server/config/` | Lazy private environment access and public projection |
| `src/lib/server/routing/` | Classification, processing, and HTTP/action adapters |
| `src/lib/server/documentation/` | Resolve/read/list/save contracts and stubs |
| `src/lib/server/markdown/` | Markdown-to-HTML contract and stub |
| `src/lib/server/auth/` | Session, authorization, login/logout, and account stubs |
| `src/lib/server/database/` | Explicit initialization contract; no startup side effect |
| `src/lib/server/git/` | Pending status and publish contracts/stubs |
| `src/routes/[...path]/` | Documentation mode placeholder and thin server loader |
| `src/routes/_/` | Login/settings/publish pages, logout/document mutation endpoints, reserved catch-all |
| `scripts/smoke.ts` | Real HTTP checks against ephemeral dev/prod server processes |

## Request flow

1. SvelteKit owns framework requests/assets. Production `kit.appDir = '_/app'`
   places compiled assets beneath the reserved namespace.
2. The server hook calls `classifyRequest(URL)` and stores the discriminated
   result in `event.locals.wikiRequest`. No I/O/authentication happens in the hook.
3. Exact `/_` and all `/_/…` paths classify as service. Query flags never change
   that. Unrecognized service routes respond 404 instead of reading documentation.
4. All other paths classify as documentation: presence of `files` selects files
   mode, otherwise `edit` selects edit mode, otherwise view. Values are irrelevant.
   The classifier preserves the URL pathname without attempting filesystem decoding.
5. The documentation loader calls `processDocumentationRequest`. Edit mode stops
   at the session-lookup stub; the authorization boundary follows a future lookup
   success. View/files stop at the resource-resolver stub. Only future successful
   resolution reaches the read/list/Markdown execution stage.
6. Mutation routes call a side-effect-free `processServiceAction` boundary. It
   returns not-implemented without parsing input or calling domain mutations.
   Future work must add authentication, authorization, same-origin checks, input
   validation, and revision checks before enabling those service calls.
7. Page actions use SvelteKit `fail(501, result)`; document/logout endpoints use
   JSON with 501 and Cache-Control: no-store. No stub creates session cookies.

The document catch-all also guards against an accidentally routed service request.
Documentation/service preview pages return 200; only action endpoints return 501.
SvelteKit's existing origin check can reject invalid form submissions before stubs.
There is no actual authentication yet: service previews are public and show no
private configuration, users, repository details, or credentials.

## Contracts for later passes

`ServiceResult<T>` is `{ status: 'ok', value: T }` or
`{ status: 'not-implemented', feature, message }`. Actual runtime error variants
(404/conflict/unauthorized, etc.) will be added when those behaviors are implemented.
It is an internal domain boundary, not a finalized public API schema.

- Requests distinguish service paths from documentation paths/modes.
- Resolved resources distinguish Markdown, directories, and assets. The resolver
  will own DOCS_DIR containment, decoding, symlinks, README and parent-folder lookup.
- Document sources carry path, Markdown, and a revision; save inputs include the
  original revision for future optimistic concurrency.
- Authentication distinguishes a not-implemented result from a real anonymous
  session. An authorization success yields a user, never an implicit permission.
- Accounts expose list/create/enable/password-change boundaries. Password/token
  persistence and first-admin bootstrap are deliberately deferred.
- Git exposes pending paths/revisions and a publish input with review revision
  and message. No subprocess or remote interaction is currently possible.

Before enabling saves/publishing, finish the revision, actor, error, and session
issuance interfaces together with their implementation and tests; the current
stubs do not claim those details are complete or safe to execute.

## Configuration and commands

See README and .env.example for DOCS_DIR, DATABASE_PATH, SITE_TITLE, ORIGIN,
GIT_REMOTE, and GIT_BRANCH. Configuration is lazy so import/build/start never
creates data. Only siteTitle/documentationConfigured are exposed to page data.

Use `bun install --frozen-lockfile`, `bun run dev`, `bun run check`, `bun test`,
`bun run build`, `bun run start`, and (after build) `bun run test:smoke`.
Smoke checks use ports 5197/5198, empty DOCS_DIR, and an isolated temporary database
location. They start/stop their own servers, check SSR text without JavaScript,
probe reserved routes and mutation statuses, inspect production asset URLs and
the client manifest, and verify no data files or session cookies are created.

## Verification

Verified on 2026-09-12 with Bun 1.4.0:

- `bun install --frozen-lockfile`: passed, no lockfile changes.
- `bun run check`: passed, zero errors and warnings.
- `bun test`: 14 request-classification tests passed.
- `bun run build`: passed with svelte-adapter-bun; production assets emitted
  beneath `/_/app/`.
- `bun run test:smoke`: passed for both development and production. Root/nested
  placeholders and flags, service-route precedence, reserved 404s, all eight
  mutation probes returning 501, server-rendered content, private-config exclusion,
  and absence of database/session writes were checked. Production CSS/JS requests
  resolved under the reserved namespace; the client manifest did not include Blok.
- `git diff --check`: passed.

Environment notes: package downloads and local listening ports required sandbox
escalation. Bun's temporary/cache directories were redirected under /tmp during
installation; no project-specific workaround is required for normal local use.
The shadcn CLI warned that only Node 22+ is officially supported, but component
generation under Bun completed and the generated output passed checks/build.
No browser automation or visual acceptance test was run in this pass; the smoke
checks verify actual HTTP/SSR behavior, not hydration or interactive editing.

## Next implementation boundary

Read-only documentation is the next pass, starting with the existing resolver,
reader/listing, and Markdown service contracts. Add safe filesystem resolution,
README/listings, sanitized SSR, relative links/assets, and tests using temporary
fixtures. Keep account, edit, and publishing functionality stubbed until their
separate passes. Do not use a real documentation repository for test writes.
