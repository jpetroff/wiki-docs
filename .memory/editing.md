# Editing architecture

Existing Markdown and allowlisted UTF-8 code/text files under `DOCS_DIR` are editable.
Directory routes target `README.md`; extensionless routes resolve to an existing file.
Saves update public content immediately. Publishing, Git operations, pending-change
tracking, deletion, and uploads remain deferred. Page/folder creation and draft
editing are implemented; see navigation.md.

## Module boundaries

Paths below are relative to `src/`.

| Module | Responsibility |
| --- | --- |
| `routes/[...path]/+page.server.ts` | Authorize `?edit`; load `{path, content, revision, kind}`; derive `canEdit`. |
| `routes/[...path]/+page.svelte` | SSR Edit control only when `canEdit`; mount editor keyed by path/revision. |
| `lib/components/editors/document-editor.svelte` | Lazy loading, mode switches, save requests, dirty/busy state, navigation guards, recovery. |
| `lib/components/editors/types.ts` | Adapter contract: `getValue(): Promise<string>`, `destroy(): void`. |
| `lib/components/editors/blok.ts` | Blok tools including native Table, native Markdown import/export, initial round-trip validation. |
| `lib/components/editors/markdown.ts` | Unsupported-syntax detection, frontmatter/EOL preservation, semantic comparison. |
| `lib/components/editors/monaco.ts` | Code/source editing, language mapping, theme, worker/model lifecycle. |
| `routes/_/api/documents/+server.ts` | Origin/auth checks, bounded JSON validation, HTTP status mapping. |
| `lib/server/documentation/index.ts` | Resolve/read/save service; UTF-8 decoding and SHA-256 revisions. |
| `lib/server/documentation/filesystem.ts` | Path containment, extension checks, serialized atomic replacement. |

## Read and editor flow

`GET ?edit` → server permission check → resolve/read → SSR editor shell → client adapter.
Anonymous edit requests redirect to login. Unauthorized readers receive no Edit
control in HTML. Page responses use `Cache-Control: no-store`; editor engines load
only in the browser when editing.

Blok enables paragraphs, H1–H6, lists/checklists, quotes, dividers, code, top-level
Markdown pipe tables, bold, italic, links, strikethrough, and inline code. Existing
text-tool definitions exclude colors, sizes, and collapsible headings; tables use
native controls. HTML, images, tables nested in lists/quotes, reference definitions,
import warnings, unknown block types, or unequal markdown-it render output trigger
Monaco fallback. Frontmatter is retained separately; unchanged exports return the
original source. Changed visual exports restore EOL style and terminal-newline presence.

Monaco handles code files and Markdown source mode. It uses the shared language
mapping, GitHub dark palette, basic TOML/JSON tokenizers, same-origin Vite workers,
and textarea input (`editContext: false`). Mode switches serialize before disposal.
Initialization is inert until ready; failures expose recoverable source and retry.
Adapters dispose editors, models, and listeners on exit.

### Markdown tables

The bundled, unmodified Blok Table tool is registered with `withHeadings: true`.
New tables use the package's default dimensions and native editing controls;
inline formatting uses the editor's existing toolbar. Top-level pipe tables are
eligible for visual editing, subject to the initial round-trip check.

Import uses Blok's `markdownToBlocksWithReport`; baseline and edited output use
`editor.blocks.exportMarkdown()` for the whole document. There is no package patch,
custom serializer, table reconciliation, or custom table UI. Blok owns conversion
and its Markdown limitations (including loss of column alignment, merged cells,
heading columns and styling). The existing semantic import guard still falls back
to source mode when native import/export changes the source's rendered meaning.
Frontmatter, EOL style and unchanged original bytes remain preserved by the adapter.

For Blok 1.13.0, explicitly aligned tables fall back to source mode because native
conversion loses alignment. Header-only tables can also fail the round-trip check
because the importer disables their heading row. No application workaround is
applied. Nested tables and raw HTML in cells are rejected by the syntax precheck.

The semantic comparison runs when mounting the visual editor, not on every save.
Once editing begins, saves and mode switches accept Blok's native Markdown output,
including its conversions of rich table features and multi-block cells. If that
output contains unsupported syntax such as `<br>`, reopening may use source mode.
The adapter restores original bytes only when the native export equals its initial
baseline; otherwise it restores frontmatter and newline conventions around the export.

Validation for this implementation: `bun run check` and seven focused tests across
`markdown.test.ts`, `blok.test.ts`, and `scripts/blok-assets.test.ts` passed. The
adapter tests mock Blok to verify native-export delegation, unchanged source/CRLF/
frontmatter preservation, and semantic fallback. They do not test Blok's browser
interactions. No Playwright tests were run for the final unpatched implementation.

## Save contract and consistency

`PUT /_/api/documents` (`POST` alias):

```json
{ "path": "guide/README.md", "content": "# Updated\n", "originalRevision": "<SHA-256>" }
```

Origin and session checks precede body parsing. Maximum JSON request size: 2 MiB.
Paths must identify exact existing allowed files; private paths, traversal,
outside-root symlinks, binary content, and malformed input are rejected.

Save sequence: process-local promise queue → resolve/revalidate → compare current
SHA-256 → write/fsync sibling temporary file → recheck path/hash → atomic rename.
File permissions are retained; no-op saves skip replacement. The queue serializes
aliases too. External writers are not locked: final hash-check/rename is not an
atomic compare-and-swap across processes.

Success returns `{status: 'ok', value: {revision}}`. Stale revisions return `409`;
other failures include `400`, `401`, `403`, `404`, `413`, `415`, `500`, and `503`.
`PATCH`/`DELETE` return `405` after authorization. The client retains local edits on
failure, adopts successful revisions, and keeps newer in-flight edits dirty.
Navigation/unload guards protect unsaved changes. There is no durable browser draft.

## Build and validation

Rolldown uses two threads; adapter precompression is disabled to limit build memory.
Vite excludes the ESM editors from eager dependency optimization.
Production builds use `scripts/blok-assets.ts` to serve Blok's prebuilt ESM graph
as local assets under a content-hashed directory, retaining relative imports and
license notices. Rebundling its optional renderers/locales alongside Monaco caused
OOM kills (exit 137) during client compilation. Development still uses Vite's
normal module resolution. The focused asset test checks the emitted import graph.

Verified: 58 focused filesystem/save/Markdown tests, clean `bun run check`, production
build, development/production HTTP smoke checks, and Chromium coverage for both
editors, mode switching, frontmatter, conflicts, fallback, and mobile layout.
Validation uses temporary documentation/accounts only. The session-local browser
harness is `/tmp/wiki-docs-visual-check/page-edits.ts`; it is not a tracked test.

## Draft integration

`DocumentEditor` accepts optional `draftParent`; drafts start with empty content and
POST to the creation endpoint on first save. The persistent navigation context carries
any newer editor input through navigation to the canonical `?edit` URL, together with
the saved revision. The newly mounted editor preserves dirty state and later uses the
existing revision-based save endpoint. Editor engines remain dynamically imported.
