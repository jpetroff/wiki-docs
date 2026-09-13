# Agreed decisions

- **Delivery:** Build incrementally. Scaffold and read-only documentation rendering
  are implemented; editors, listings, accounts, and publishing remain deferred.
- **Rendering:** Full server-rendered HTML on each request, not static generation.
- **Content source:** DOCS_DIR in .env names an existing folder elsewhere on the
  same host. Never clone anything; later discover its enclosing Git checkout.
- **URLs:** Documentation paths mirror actual filenames, including extensions.
  Folders require the exact README.md filename, otherwise return 404.
  Both trailing-slash spellings are accepted.
  `/_/` is reserved for service paths and application assets.
- **Files mode:** `?files` remains an explicit placeholder in the reading pass.
  Future listings use the folder or a file’s parent. It takes precedence over `?edit`.
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

- **Reader:** markdown-it parses Markdown; rehype sanitizes HTML; Shiki highlights
  sanitized code. Embedded documentation HTML is supported without active content.
- **Allowed pages:** .md, .sh, .txt, .json, .yaml, .yml, .toml, .py, .tf; non-Markdown
  files display UTF-8 source. Extensions are explicit and case-sensitive.
- **Images:** PNG/JPEG/GIF/WebP/AVIF via /_/assets; SVG and arbitrary downloads deferred.
- **Highlighting:** Shared GitHub dark theme, language registry and aliases;
  editor choice remains open. No editor or highlighter engine in the reader client.
- **Unavailable docs:** Missing/invalid DOCS_DIR is valid at build/start but returns
  503 for documentation requests. Missing/blocked resources return 404.

- **Extensionless routes:** Try the ordered page allowlist only when an exact path
  is absent; directories keep README-or-404 behavior. Asset URLs stay explicit.
- **Copy code:** Client-side progressive enhancement adds buttons to block code and
  source pages, preserving text with success/failure feedback and HTTP fallback.

- **Theme:** Dark-only shadcn/ui neutral palette; root tokens and native color scheme
  are always dark. No light palette, system preference, or theme toggle.
