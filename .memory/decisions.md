# Agreed decisions

- **Delivery:** Build incrementally. First pass is a runnable scaffold, installed
  dependencies, typed server boundaries/stubs, and persistent documentation only.
- **Rendering:** Full server-rendered HTML on each request, not static generation.
- **Content source:** DOCS_DIR in .env names an existing folder elsewhere on the
  same host. Never clone anything; later discover its enclosing Git checkout.
- **URLs:** Documentation paths mirror actual filenames, including extensions.
  Folders prefer the exact README.md filename, otherwise show a listing.
  `/_/` is reserved for service paths and application assets.
- **Files mode:** `?files` replaces content with the folder listing; for a file,
  list its parent. It takes precedence over `?edit` when both are present.
- **Reading/accounts:** Public reading; administrators create editor accounts.
  No self-registration. Bootstrap the first administrator with a local command.
- **Storage:** SQLite outside DOCS_DIR for users, sessions, and eventual pending
  wiki change tracking. Use Bun's native SQLite/password APIs, no database ORM.
- **Editing:** Existing Markdown only. Folder editing targets an existing README.
  No page creation, uploads, moves, renames, or deletion in this version.
- **Editor:** Blok client-only, Markdown-compatible tools. Preserve frontmatter
  and fall back to plain Markdown source for unsupported constructs. Source
  editing remains available. Never silently discard unsupported content.
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
