# Navigation and creation

See [frontmatter.md](frontmatter.md) for metadata syntax, title precedence, editor
preservation, cache freshness, and the current root-label fallback caveat.

## Architecture

Paths below are relative to `src/`.

- `routes/+layout.server.ts` loads the complete cached tree once without URL-dependent navigation reloads.
  `routes/+layout.svelte` owns a per-layout `NavigationState` context.
- `lib/components/navigation/` provides the sidebar, directory list, creation menus,
  and reactive in-memory expansion state. Expanding/revealing folders makes no requests.
- `lib/shared/navigation.ts` defines recursive entry types and encoded URL helpers.
- `lib/server/documentation/filesystem.ts` implements directory resolution, bounded
  traversal, and creation; mutations share the existing process-local save queue.
- `lib/server/documentation/filenames.ts` selects front matter/H1 titles and generates filenames.
  `http.ts` centralizes bounded JSON parsing and creation error responses.

## Navigation behavior

Root stays open; nested folders start collapsed. Folder links navigate and expand;
chevrons only toggle. Expansion survives client navigation, resets on reload, and
retains the loaded snapshot until a full reload. Creation reveals known ancestors without refreshing.
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

Directory nodes: `{kind: 'directory', name, path, title?, hasIndex, hasChildren, children?}`.
File nodes: `{kind: 'file', name, path, title?}`. Paths are documentation-relative; query values
use normal URL encoding. Existing PUT/POST document saves remain unchanged.

Reads are public. Mutations require matching Origin and editor/admin permission before
JSON parsing (2 MiB limit). Parents must exist and pass containment/visibility checks.

## Creation and consistency

Folders preserve trimmed names, reject invalid segments/collisions, and receive an
empty `README.md`. Failed creation removes only its own empty artifacts.

`/_/new?parent=...` opens an in-memory editor draft; only Save writes it. A nonempty string front matter title supplies the filename, falling back to the first
top-level Markdown H1 outside code, quotes, and lists. Plain title text becomes NFC/lowercase; nonletters/nonnumbers become hyphens.
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

## Front matter and manual snapshots

- Shared front matter splitting preserves leading YAML bytes; Bun parses titles on
  the server. Invalid YAML warns during scanning and falls back without blocking
  reading/saving. Other metadata has no schema validation.
- `scripts/scan-docs.ts` uses the existing reader traversal at unlimited depth and
  atomically writes nested YAML navigation; `scripts/build-app.ts` bundles it
  as `scan-docs.js` and copies environment files into build output. `bun run cache`
  writes the development snapshot; deployed usage is `NODE_ENV=production bun scan-docs.js`.
- Builds preserve `navigation.yaml`; no automatic scans. Cache metadata includes a
  root fingerprint, relative paths, optional titles, and directory README flags.
- `lib/server/documentation/cache.ts` validates/reconstructs the complete tree,
  retains it in memory, and checks file identity/timestamps for atomic replacements.
  GET folder depth limits remain 0–10 but slice the snapshot rather than scan disk.
- Navigation/listing labels use metadata title then original name; directory titles
  come from exact README.md, with SITE_TITLE as root fallback. Sorting remains by name.
- Missing/invalid/wrong-root caches make listings unavailable (503), not live-scanned.
  Live README resolution, direct reads, editing, and creation-parent checks are
  independent of the cache. New entries and labels need manual scan plus reload.
- Focused tests cover parsing, full-depth YAML round trips, traversal safety,
  replacement/failure behavior, title filenames, and compiled Svelte expansion
  without network calls. No Playwright or broad smoke suite is required for this change.
