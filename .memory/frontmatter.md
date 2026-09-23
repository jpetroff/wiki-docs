# Front matter metadata

Current implementation reference, checked against the source on 2026-09-23.
Related notes: [rendering](rendering.md), [editing](editing.md), and
[navigation and caching](navigation.md).

## Supported syntax

Markdown can start with a YAML block:

```markdown
---
title: Getting started
owner: Documentation team
tags: [setup, reference]
---
# Install the tools
```

The opening `---` must be the first line, optionally preceded by a UTF-8 BOM.
A standalone `---` or `...` closes the block. LF and CRLF are supported. A block
later in the document, or an opening block without a closing delimiter, remains
ordinary Markdown. Empty complete blocks are supported.

Only the exact, case-sensitive `title` field currently affects app behavior. It
must parse as a string and remain nonempty after trimming. Missing, blank, null,
numeric, array, or object titles are ignored rather than coerced. Quote values
that YAML would otherwise interpret as another type, such as `title: "2026"`.

Additional fields are accepted without schema validation. They remain in the
Markdown source but do not control rendering, access, sorting, URLs, or publishing.
The app does not expose them as structured page metadata or include them in the
navigation cache. Authorized source editing still returns the complete source.

Malformed YAML does not block reading or saving: the title is ignored, and the
scanner emits a warning naming the file. A complete block is removed from the
rendered body even when its YAML is invalid; an unclosed block is not removed.

## Where the title is used

| Surface | Selection and behavior |
| --- | --- |
| Markdown reader browser title | Front matter title, then first nonempty rendered heading (any level), then filename; append ` — SITE_TITLE` |
| Reader article accessibility label | The same resolved document title, without the site suffix |
| Sidebar and directory listing file labels | Cached front matter title, otherwise actual filename; Markdown headings are not a navigation fallback |
| Directory labels and listing headings/browser titles | Title from the exact readable `README.md`, otherwise directory name |
| Navigation controls | Display titles also label expand/collapse controls and creation menus |
| New Markdown filename | Front matter title, otherwise first top-level Markdown H1; normalize the selected text into a filename |
| Existing editor browser title | Uses the document path (`Edit <path>`), not front matter |
| Site header/branding | Continues to use configured `SITE_TITLE` |

The example above has reader title `Getting started — <site title>` and navigation
label `Getting started`; the visible article still starts with `Install the tools`.
No extra H1 is inserted. Heading anchors derive from body headings, not metadata.
Titles are displayed as text, not interpreted as Markdown or author HTML.

For `guide/README.md`, the metadata title labels the `guide` directory. README
files stay omitted as separate tree/list entries. File names, routing, relative
links, and directory-first natural filename ordering remain independent of titles.

Root fallback detail: UI helpers accept `SITE_TITLE` when the root has no name or
title. The current YAML cache writer, however, serializes its own `Documentation`
fallback as the root title when root README metadata is absent. Consequently a
loaded generated cache currently displays `Documentation` in that case, even
with a custom `SITE_TITLE`. Set the root README title for an explicit root label.

## Creation and editing

New documents may use a metadata title without an H1. Without usable metadata,
filename extraction takes the first top-level H1 outside code fences, quotes,
and lists. It normalizes to NFC/lowercase, replaces nonletters/nonnumbers with
hyphens, and appends `.md`. Names fit within 255 UTF-8 bytes; collisions use `-2`,
`-3`, etc. A selected title that normalizes to an empty stem rejects creation
(a punctuation-only metadata title does not retry using the body H1).

Changing metadata on an existing document never renames the file. Saves preserve
the supplied Markdown source, including extra YAML fields. Use source mode to
edit metadata; there is no separate metadata form. Visual editing operates on the
body and restores the original front matter prefix byte-for-byte, preserving BOM,
delimiter choice, and line endings. An unchanged visual export returns the original
source unchanged. Source revisions cover the complete file, including metadata.

## Navigation snapshot and freshness

The current cache is `navigation.yaml` (the earlier TOML format was replaced).
The manual scanner reads front matter in visible supported Markdown files and
writes nested `title`, `href`, and `items` entries. Directories with README files
link to those files; directories without them retain a `path`. Generated titles
already contain name fallbacks. A header comment holds format/root identity.
Document bodies and unrelated author metadata are excluded.

Run from the source checkout for development:

```sh
bun run cache
```

Or run from the build/deployment directory using its copied environment:

```sh
NODE_ENV=production bun scan-docs.js
```

The scanner reads `DOCS_DIR` and atomically replaces the snapshot. The server
detects replacement without restarting. Fully reload the page to replace the
browser's complete in-memory tree; expanding or revealing folders makes no branch
requests. Builds, startup, saves, and creation do not trigger scanning.

Reader titles/body content come from the live document and can change before
sidebar/listing labels do. Newly created entries and changed labels require a
manual scan. Missing, invalid, or wrong-root snapshots make navigation unavailable
and listings return 503; direct document reads, readable README directory views,
editing, and creation remain available independently of the snapshot.

## Implementation entry points

Paths are relative to the repository root:

- `src/lib/shared/frontmatter.ts`: shared block boundary detection and exact prefix preservation.
- `src/lib/server/documentation/frontmatter.ts`: Bun YAML parsing and title extraction.
- `src/lib/server/markdown/index.ts`: body rendering and reader title precedence.
- `src/lib/server/documentation/filenames.ts`: title selection and filename normalization.
- `src/lib/components/editors/markdown.ts`: visual-editor prefix and line-ending restoration.
- `src/lib/server/documentation/filesystem.ts`: scanned file titles and README inheritance.
- `src/lib/server/documentation/cache.ts`: snapshot serialization, validation, and reload detection.
- `src/lib/shared/navigation.ts`: UI title fallback helper.

Focused coverage lives in `frontmatter.test.ts` and `cache.test.ts` under server
documentation, plus the editor Markdown/Blok and navigation tests. This note is a
documentation-only update; no application behavior was changed.
