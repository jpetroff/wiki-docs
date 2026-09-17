# Navigation and creation

## Architecture

Paths below are relative to `src/`.

- `routes/+layout.server.ts` loads root depth 1 for documentation/draft pages.
  `routes/+layout.svelte` owns a per-layout `NavigationState` context.
- `lib/components/navigation/` provides the sidebar, directory list, creation menus,
  and reactive branch/loading/error state. Concurrent branch requests are deduplicated.
- `lib/shared/navigation.ts` defines recursive entry types and encoded URL helpers.
- `lib/server/documentation/filesystem.ts` implements directory resolution, bounded
  traversal, and creation; mutations share the existing process-local save queue.
- `lib/server/documentation/filenames.ts` extracts H1 titles and generates filenames.
  `http.ts` centralizes bounded JSON parsing and creation error responses.

## Navigation behavior

Root stays open; nested folders start collapsed. Folder links navigate and expand;
chevrons only toggle. Expansion survives client navigation, resets on reload, and
refreshes branch contents when reopened. Creation refreshes/reveals parent ancestors.
Mobile uses a collapsible panel; creation menus use native details/dialog controls.

Folders sort first, then naturally ordered filenames. Exact `README.md`, hidden and
reserved paths, unsupported/image/binary files, and ancestor symlink cycles are omitted.
Contained symlink aliases remain supported. README views highlight their folder.

Directory routes render readable `README.md` or an immediate listing. `?files` lists
the directory or resolved file's parent and takes precedence over `?edit`. The page
loader dispatches listings before document rendering. Links/listings work without JS.

## HTTP contracts

Successful responses use `{status: 'ok', value}` and `Cache-Control: no-store`.

| Endpoint | Input | Value |
| --- | --- | --- |
| `GET /_/api/folders` | `path` defaults to root (`''`); `depth` defaults to 1, accepts integers 0–10 | Directory tree; depth 0 returns metadata only |
| `POST /_/api/folders` | `{parentPath, name}` | `{path}`; HTTP 201 |
| `POST /_/api/documents/create` | `{parentPath, content}` | `{path, revision}`; HTTP 201 |

Directory nodes: `{kind: 'directory', name, path, hasIndex, hasChildren, children?}`.
File nodes: `{kind: 'file', name, path}`. Paths are documentation-relative; query values
use normal URL encoding. Existing PUT/POST document saves remain unchanged.

Reads are public. Mutations require matching Origin and editor/admin permission before
JSON parsing (2 MiB limit). Parents must exist and pass containment/visibility checks.

## Creation and consistency

Folders preserve trimmed names, reject invalid segments/collisions, and receive an
empty `README.md`. Failed creation removes only its own empty artifacts.

`/_/new?parent=...` opens an in-memory editor draft; only Save writes it. The first
top-level Markdown H1 supplies the filename, excluding frontmatter, code, quotes, and
lists. Plain title text becomes NFC/lowercase; nonletters/nonnumbers become hyphens.
Append `.md`; reject empty stems; truncate within 255 UTF-8 bytes including suffix.
Collisions use `-2`, `-3`, etc. Later heading edits never rename existing files.

Creation writes/fsyncs a hidden sibling temporary file, then atomically hard-links it
to an unoccupied name and removes the temporary link. Existing entries are never
replaced. Parent checks and the mutation queue do not lock external filesystem writers.

`DocumentEditor.draftParent` selects initial creation. `NavigationState.pendingEdit`
carries newer input, saved content, and revision through navigation to the canonical
`?edit` URL. Subsequent saves use revision checks. Failed saves retain input; cancel
creates nothing. No durable drafts, schema migration, or Git operations were added.

## Verification

Passed: 75 focused Bun tests, `bun run check`, production build, and development/
production HTTP smoke tests. Coverage includes depth/visibility, encoded paths,
containment/cycles, H1 parsing, filename limits, concurrent collisions, failure cleanup,
authorization, Origin checks, and existing-save compatibility.

Chromium verified expansion/reset, folder creation, save with newer in-flight input,
subsequent save, cancel, active highlighting, keyboard controls, mobile overflow, and
reading without JS. All checks used temporary docs/accounts. The session-only browser
harness was `/tmp/wiki-navigation-browser/check.ts`; it is not a repository dependency.
