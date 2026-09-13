# Documentation rendering

## Components

Paths below are relative to the application root.

| Component | Responsibility |
| --- | --- |
| `src/lib/server/config/index.ts` | Lazy, server-only `DOCS_DIR` configuration |
| `src/lib/server/routing/classify.ts` | Reserved `/_/` routes; `files` → `edit` → `view` mode precedence |
| `src/routes/[...path]/+page.server.ts` | Classify the tracked URL, load content, disable response caching; URL tracking enables client navigation updates |
| `src/lib/server/routing/process.ts` | Resolve → read → choose Markdown or source renderer; non-view modes remain stubs |
| `src/lib/server/documentation/filesystem.ts` | Path decoding, containment, README/extension lookup, file reads |
| `src/lib/server/documentation/index.ts` | UTF-8 validation and source metadata, including SHA-256 revision |
| `src/lib/server/markdown/index.ts` | Markdown parsing, HTML sanitation, links, headings, source rendering |
| `src/lib/server/markdown/highlighter.ts` | Lazy, reusable server-side Shiki instance |
| `src/lib/shared/highlighting.ts` | Ordered extension allowlists, language registry/aliases, dark theme |
| `src/routes/_/assets/[...path]/+server.ts` | Image GET/HEAD responses using the same filesystem checks |
| `src/lib/server/routing/http.ts` | Domain outcomes → HTTP errors; private error logging |
| `src/routes/[...path]/+page.svelte`, `src/app.css` | Article HTML, document title/path, scoped typography and responsive styling |
| `src/lib/actions/copy-code.ts` | Clipboard buttons, feedback, and cleanup after content changes |

## Folder lookup and display decisions

There is **no recursive folder scan, directory index, or startup content import**.
Each request probes its path beneath the existing `DOCS_DIR` using `realpath` and
`stat`. Only extensionless fallback probes multiple candidate names.

| Requested resource | Result |
| --- | --- |
| Existing directory, including `/` | Render exact `README.md`; otherwise 404 |
| Existing `.md` file | Render Markdown as HTML |
| Existing allowed non-Markdown file | Show highlighted source; never execute |
| Absent extensionless leaf | Try allowed suffixes in order; use first resolved candidate |
| Unsupported, missing, hidden, or non-regular resource | 404 |
| Missing/invalid documentation root | Generic 503 |
| Unexpected read/render failure | Generic 500; details logged server-side |

Page extension order: `.md`, `.sh`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`, `.py`,
`.tf`. Matching is case-sensitive. Exact paths win over suffix lookup; a directory
without README does not fall back to a sibling Markdown file. Explicit extensions,
trailing-slash paths, and asset requests never use extension fallback. Directory
URLs work with or without a trailing slash.

Decode URL segments once. Reject malformed encoding, separators inside decoded
segments, control characters, dot-prefixed segments, and traversal. Check resolved
paths remain inside the root; symlink targets must be visible and have an allowed
extension. Revalidate before reading. Text must be valid UTF-8 without NUL bytes.
The resolved logical filename—not an absolute filesystem path—travels downstream.

## Rendering pipeline

```text
tracked URL → classify → resolve file → read UTF-8
  Markdown: markdown-it → rehype-parse → headings/URLs → rehype-sanitize
                        → Shiki code AST → rehype-stringify
  Source:   Shiki code AST → rehype-stringify
→ { html, title, sourcePath } → server-rendered article → clipboard enhancement
```

markdown-it enables embedded HTML and linkification; typographic substitutions
are disabled. It handles headings, emphasis, lists, blockquotes, tables,
strikethrough, links, images, inline code, and fenced/indented code.

Sanitation retains common documentation HTML, including `details`/`summary`, and
removes active content, unsafe URLs, and author styles. Table alignment becomes a
safe `align` attribute before styles are removed. Trusted Shiki output is added
**after sanitation**, preserving generated token colors without admitting author CSS.

Heading IDs use GitHub-style slugs, duplicate suffixes, and the sanitizer's
`user-content-` prefix. Internal document fragments receive the matching prefix.
The first heading supplies the page title; files without headings use their name.

## Links and images

Resolve relative URLs against the matched source file's directory, including when
requested through a directory or extensionless alias. Emit root-relative URLs;
preserve queries and encoded filenames. Permitted external URLs stay unchanged.
The same handling applies to Markdown and embedded HTML `href`/`src` attributes.

Example: `../setup#install` in `guide/README.md` becomes
`/setup#user-content-install`; `/setup` resolves through the extension allowlist.

Local `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, and `.avif` references become
`/_/assets/<logical-path>`. The endpoint returns bytes, explicit MIME/content length,
`nosniff`, and `no-store`; HEAD omits the body. Remote images are not proxied.
SVG and arbitrary downloads are unsupported.

## Highlighting, clipboard, and boundaries

Shared configuration defines languages, aliases, filename mappings, and
`github-dark` theme. Unknown languages render as plain text. The
reader caches only the Shiki instance; file content is read on every request.
Future source-editor adapters must reuse this configuration. Editor selection is
deferred; Markdown parsing and highlighting engines stay outside the client bundle.

Article styles scope typography, responsive images, and scrolling tables/code;
dark colors are the sole root palette; Shiki emits the dark theme directly. After hydration, a Svelte action adds Copy buttons to
block code and source pages. It copies `code.textContent`, preserves whitespace,
announces success/failure, and falls back to `execCommand` when the Clipboard API
is unavailable. HTML updates/navigation remove old controls, listeners, and timers.
Inline code has no button; reading works without JavaScript.

`?files` and `?edit` remain previews, with files mode winning. Mutation endpoints
remain 501 stubs. No directory listings, editor, accounts, database initialization,
Git operations, or writes into `DOCS_DIR` are implemented. Build/start does not
require a documentation root. Private filesystem paths never reach page data.

## Validation

Last implementation checks: 81 unit tests, `bun run check`, production build, and
dev/prod HTTP smoke tests passed. Tests use temporary fixtures, not the configured
repository. Browser checks covered mobile/desktop themes, clipboard contents and
failure/fallback paths, extensionless navigation, and control cleanup. Vite itself
returns 403 for `/.git/config` in development; production returns 404.
