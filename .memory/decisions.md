# Agreed decisions

- **Delivery:** Build incrementally. Scaffold and read-only documentation rendering
  and login foundations, page editing, navigation, listings, and creation are implemented;
  browser account management and publishing remain deferred.
- **Rendering:** Full server-rendered HTML on each request, not static generation.
- **Content source:** DOCS_DIR in .env names an existing folder elsewhere on the
  same host. Never clone anything; later discover its enclosing Git checkout.
- **URLs:** Documentation paths mirror actual filenames, including extensions.
  Folders render exact readable README.md, otherwise an immediate directory listing.
  Both trailing-slash spellings are accepted.
  `/_/` is reserved for service paths and application assets.
- **Files mode:** `?files` lists the folder or a resolved file’s parent. It takes precedence over `?edit`.
- **Reading/accounts:** Public reading; administrators create editor accounts.
  No self-registration. Bootstrap the first administrator with a local command.
- **Storage:** SQLite outside DOCS_DIR for users, sessions, and eventual pending
  wiki change tracking. Use Bun's native SQLite/password APIs, no database ORM.
- **Editing:** All existing allowed Markdown and text/code pages. Folder editing targets an existing README.
  Page/folder creation is implemented; uploads, moves, renames, and deletion remain deferred.
- **Editor:** Blok client-only, Markdown-compatible tools; Monaco for code and source mode. Preserve frontmatter
  and fall back to plain Markdown source for unsupported constructs. Source
  editing remains available. Preserve unsupported imported content through source fallback.
- **Markdown tables (implemented):** Use Blok's unmodified Table tool and native
  Markdown import/export for the entire document. Keep this integration simple:
  no dependency patches, custom table serializer, or custom table controls.
  Initial semantic round-trip validation protects imported documents; subsequent
  visual edits use Blok's output and its formatting limitations. See editing.md.
- **Save visibility:** Local saves become publicly visible immediately. Publish
  synchronizes Git; it is not a reader-visibility or approval boundary.
- **Publishing:** Any editor can review and publish all pending wiki edits.
  Save and Publish are separate actions. Host-managed Git credentials only.
- **Configuration:** Repository location/Git settings stay operator-managed in
  .env; future settings UI manages accounts and shows read-only service status.
- **Runtime:** One Bun application process and one documentation root/checkout.
- **First-pass defaults:** Missing DOCS_DIR is a valid scaffold state; site title
  defaults to WikiDocs, database path to ./data/wiki.sqlite. No database or
  documentation folder is created. No local absolute paths are exposed to clients.

- **Reader:** markdown-it parses Markdown; rehype sanitizes HTML; Shiki highlights
  sanitized code. Embedded documentation HTML is supported without active content.
- **Allowed pages:** .md, .sh, .txt, .json, .yaml, .yml, .toml, .py, .tf; non-Markdown
  files display UTF-8 source. Extensions are explicit and case-sensitive.
- **Images:** PNG/JPEG/GIF/WebP/AVIF via /_/assets; SVG and arbitrary downloads deferred.
- **Highlighting:** Shared GitHub dark theme, language registry and aliases;
  Monaco uses the shared language mapping and GitHub dark palette. No editor or highlighter engine in the reader client.
- **Unavailable docs:** Missing/invalid DOCS_DIR is valid at build/start but returns
  503 for documentation requests. Missing/blocked resources return 404.

- **Extensionless routes:** Try the ordered page allowlist only when an exact path
  is absent; directories keep precedence and render README or a listing. Asset URLs stay explicit.
- **Copy code:** Client-side progressive enhancement adds buttons to block code and
  source pages, preserving text with success/failure feedback and HTTP fallback.

- **Theme:** Dark-only shadcn/ui neutral palette; root tokens and native color scheme
  are always dark. No light palette, system preference, or theme toggle.

- **Login foundation (implemented):** Public reading; local bootstrap/create/reset
  commands, no signup or browser account management. Normalized ASCII usernames,
  15–128-character passwords, Argon2id, hashed opaque sessions, fixed 30-day expiry.
  Login/logout and existing edit/publish/settings placeholders enforce server auth.
- **Account operations:** Password reset revokes all sessions transactionally;
  concurrent login rechecks the stored password hash before issuing a session.
  Rate limits persist in SQLite: five attempts per username per 15 minutes,
  60 globally per minute. See `.memory/authentication.md` for implementation notes.
- **Persistent production data:** Absolute DATABASE_PATH outside DOCS_DIR and the
  deployment directory, including symlink equivalents. Deployment preflight runs
  before replacement; bundled account CLI enforces production paths. Anonymous
  reading remains available without account storage. No deployment in this pass.

- **Navigation and creation (implemented):** Root stays open; nested folders start
  collapsed. Folder links open and expand, chevrons only toggle. Hide exact README.md,
  unsupported/binary/private files, and cyclic directory links. Public folder API
  accepts a relative start path and depth 0–10. Editors create folders with blank
  indexes or in-memory document drafts. First top-level H1 produces a lowercase
  Unicode `.md` filename; collisions add numbers. Existing titles never rename files.
  Save alone writes a draft; failed saves/canceled drafts leave input intact/no file.
  See navigation.md for service contracts, consistency, and validation.
