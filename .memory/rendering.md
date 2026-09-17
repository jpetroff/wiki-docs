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
| `src/lib/server/markdown/mermaid.ts` | markdown-it plugin emitting escaped diagram source placeholders |
| `src/lib/shared/highlighting.ts` | Ordered extension allowlists, language registry/aliases, dark theme |
| `src/routes/_/assets/[...path]/+server.ts` | Image GET/HEAD responses using the same filesystem checks |
| `src/lib/server/routing/http.ts` | Domain outcomes → HTTP errors; private error logging |
| `src/routes/[...path]/+page.svelte`, `src/app.css` | Article HTML, document title/path, scoped typography and responsive styling |
| `src/lib/actions/copy-code.ts` | Clipboard buttons, feedback, and cleanup after content changes |
| `src/lib/actions/mermaid.ts` | Lazy MermaidJS loading, SVG rendering, per-diagram errors, and navigation cleanup |

## Folder lookup and display decisions

There is no startup content import. Navigation performs request-time directory scans
with explicit depth limits; see navigation.md.
Each request probes its path beneath the existing `DOCS_DIR` using `realpath` and
`stat`. Only extensionless fallback probes multiple candidate names.

| Requested resource | Result |
| --- | --- |
| Existing directory, including `/` | Render exact readable `README.md`; otherwise list immediate entries |
| Existing `.md` file | Render Markdown as HTML |
| Existing allowed non-Markdown file | Show highlighted source; never execute |
| Absent extensionless leaf | Try allowed suffixes in order; use first resolved candidate |
| Unsupported, missing, hidden, or non-regular resource | 404 |
| Missing/invalid documentation root | Generic 503 |
| Unexpected read/render failure | Generic 500; details logged server-side |

Page extension order: `.md`, `.sh`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`, `.py`,
`.tf`. Matching is case-sensitive. Exact paths win over suffix lookup; a directory
without README displays a listing and does not fall back to a sibling Markdown file. Explicit extensions,
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
  Markdown: markdown-it + Mermaid plugin → rehype-parse → headings/URLs → rehype-sanitize
                        → Shiki code AST → rehype-stringify
  Source:   Shiki code AST → rehype-stringify
→ { html, title, sourcePath } → server-rendered article → clipboard + Mermaid enhancement
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

Fences whose first language token is exactly `mermaid` become `.mermaid-block`
wrappers containing escaped source in `pre > span`. The span preserves initial
blank lines through server and browser HTML parsing; omitting `code` keeps Shiki
and Copy enhancement from touching diagram placeholders. Sanitization permits only
the specific wrapper class, without admitting author SVG, styles, or scripts.

The browser loads Mermaid only when a document contains diagrams. Its official
`mermaid.min.js` browser bundle is a local, fingerprinted Vite URL asset, loaded
through a dynamically imported URL module and script element. This avoids rebuilding
Mermaid's dependency tree, which exceeded the available build memory with the ESM
entry. The full browser bundle supports Mermaid's bundled diagram types; it is not
downloaded on ordinary pages. No CDN or external rendering service is used.

Mermaid initializes once with strict security, dark appearance, the existing Roboto
font, automatic rendering disabled, and built-in error SVGs suppressed. Its default
protected configuration keys remain protected, along with theme and font family.
Rendering waits for fonts and runs serially in temporary measurement containers,
with unique SVG IDs and revision/connectivity guards against stale navigation work.
Success replaces source with Mermaid's sanitized SVG. Failures show a status box
with “Unable to render diagram” and a literal error message, without a stack trace;
empty diagrams and renderer-loading failures also get visible errors. One failure
does not stop subsequent diagrams. Without JavaScript, the source remains readable.

Article styles scope typography, responsive images, and scrolling tables/code;
dark colors are the sole root palette; Shiki emits the dark theme directly. After hydration, a Svelte action adds Copy buttons to
block code and source pages. It copies `code.textContent`, preserves whitespace,
announces success/failure, and falls back to `execCommand` when the Clipboard API
is unavailable. HTML updates/navigation remove old controls, listeners, and timers.
Inline code has no button; reading works without JavaScript.

`?files` renders directory listings and takes precedence over `?edit`. Editing and
creation are implemented; see [editing.md](editing.md) and [navigation.md](navigation.md).
Account-management/publishing mutations remain stubs. Build/start does not require
a documentation root. Private filesystem paths never reach page data.

## Validation

Last implementation checks: 81 unit tests, `bun run check`, production build, and
dev/prod HTTP smoke tests passed. Tests use temporary fixtures, not the configured
repository. Browser checks covered mobile/desktop themes, clipboard contents and
failure/fallback paths, extensionless navigation, and control cleanup. Vite itself
returns 403 for `/.git/config` in development; production returns 404.

Mermaid implementation checks: 85 unit tests, `bun run check`, and `bun run build`
passed. A focused production Chromium check covered flowchart/sequence rendering,
syntax and empty-input errors between valid diagrams, literal HTML in error text,
leading source whitespace without JavaScript, lazy loading on diagram pages only,
blocked renderer downloads, desktop/mobile layout, existing Copy buttons, and
navigation while the renderer was loading. Temporary measurement elements were
removed and no unhandled browser errors occurred.

## Navigation update

The page loader dispatches directory fallback and `?files` views before document-body
rendering. Explicit files mode resolves directories or the matched file’s parent.
Root navigation data is server-rendered in the persistent layout; deeper branches
load via the folder API. See [navigation.md](navigation.md) for contracts and state flow.
