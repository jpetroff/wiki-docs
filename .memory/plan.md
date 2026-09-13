# WikiDocs product plan

## Product outcome

A wiki engine serves Markdown from an existing documentation folder on the same
host. Public readers receive server-rendered HTML. Administrator-managed editors
can edit existing Markdown, save locally, and separately commit/push all pending
wiki edits. The documentation repository is separate from this application.

## Delivery passes

1. **Scaffold (completed):** Install SvelteKit, TypeScript, Tailwind,
   shadcn-svelte, Bun/Vite, the Bun adapter, Blok, and Markdown dependencies.
   Establish server module boundaries, request classification and explicit stubs,
   a placeholder UI, example configuration, checks, and these memory files.
   Start without DOCS_DIR. Do not implement the following passes yet.
2. **Read-only documentation (implemented):** Resolve paths beneath DOCS_DIR; render sanitized
   markdown-it HTML with Shiki highlighting on every request. Exact filenames retain extensions.
   Folders render exact README.md or return 404; both trailing-slash spellings
   work. Directory listings and `?files` remain deferred placeholders. Resolve relative links/assets against the source Markdown folder.
   Return 404 for missing paths. Contain decoded paths and symlinks within the
   root, hide private dotfiles/Git metadata, display allowed text source files, and serve
   raster images through /_/assets. SVG and arbitrary downloads remain deferred.
3. **Accounts (foundation implemented; browser management deferred):** Added local
   bootstrap/create/reset commands, login/logout, fixed 30-day sessions, server
   authorization, persistent throttling, and deployment data protection. Remaining:
   browser account management, enable/disable, self-service password changes, and
   last-admin protection when enabling those mutations. Original target: bun:sqlite
   users/sessions, Argon2id passwords, hashed opaque
   session tokens, HttpOnly/SameSite cookies (Secure on HTTPS), a local interactive
   first-admin command, login/logout, password changes, and admin account
   management. No signup/default credentials. Revoke sessions on account disable
   or password reset; protect the last admin. Enforce authorization, same-origin
   mutations, and login throttling server-side.
4. **Editing:** `?edit` opens existing Markdown or an existing folder README for
   authenticated editors; anonymous visitors go to login with a safe return URL.
   Mount/destroy Blok client-side, limit tools to Markdown-compatible structures,
   preserve frontmatter, and offer source editing when syntax cannot round-trip.
   Detect unsupported constructs through AST inspection and semantic round-trip
   checks. Provide Save/Cancel and unsaved-change protection. Save atomically with
   original-content-hash checks; HTTP 409 must retain the user's local edits.
   No-op saves do not rewrite files. Creation, uploads, moves, renames, and
   deletion are outside the agreed version.
5. **Publishing:** Track pending wiki paths/revisions in SQLite. Any editor can
   review all pending wiki edits and publish with a commit message. Serialize
   repository mutations and revalidate the review, file revisions, and HEAD.
   Commit only reviewed wiki changes; identify the publishing user. Use the
   host's Git credentials and configured branch/upstream. Refuse external
   conflicting edits, unrelated staged changes, and unreviewed outgoing commits.
   Retain files/status on failure; retry a failed push without duplicating the
   successful local commit. Never reset, force-push, switch branches, or
   automatically merge remote divergence.
6. **Integration hardening:** Exercise the complete login/edit/save/publish flow
   and mobile directory navigation. Test HTML without JavaScript, relative links,
   assets, filenames, Markdown preservation, authorization, CSRF, XSS, traversal,
   symlinks, stale edits, and Git failure/retry against temporary local repos.
   Complete operational and backup documentation for the SQLite file and checkout.

## Architecture and delivery constraints

- SvelteKit SSR with TypeScript, Tailwind/shadcn-svelte, Vite under Bun, and
  svelte-adapter-bun for production. SQLite/password APIs are built into Bun.
- All application/service URLs and production assets belong under `/_/`.
- Configuration lives in .env: documentation folder, local database location,
  site title, public origin, optional Git remote and branch overrides.
- One application process manages one documentation root and existing checkout.
- Responsive breadcrumbs, article typography, Files/Edit/Publish controls, and
  accessible shadcn components; no feature-heavy UI in the scaffold.
- Do not touch a real documentation repository during application validation.
- Each pass updates decisions.md and scaffolding.md (or subsequent implementation
  notes), reports verification honestly, and stops at its agreed boundary.

## Reference integrations

- Blok: https://blokeditor.com/docs/quick-start/
- Markdown API: https://blokeditor.com/docs/use-blocks/
- shadcn-svelte: https://shadcn-svelte.com/docs/installation/sveltekit
- Bun/SvelteKit: https://bun.sh/guides/ecosystem/sveltekit

Current implementation details and validation: see `.memory/rendering.md`.
