import { parseFrontmatter } from './frontmatter';
import { realpath, stat, readFile, open, rename, unlink, readdir, mkdir, rmdir, link } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { documentExtensions, imageExtensions, extensionOf } from '../../shared/highlighting';
import type { ServiceResult } from '../../shared/result';
import { childPath, documentUrl, type DirectoryNode, type NavigationEntry } from '../../shared/navigation';
import { documentFilename, documentStem } from './filenames';

export interface ResolvedFile {
  kind: 'markdown' | 'source' | 'asset';
  /** Decoded, root-relative logical path, never an absolute filesystem path. */
  path: string;
}
const missing = (): ServiceResult<never> => ({ status: 'not-found' });
export const revisionOf = (bytes: string | Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
export type SaveResult = ServiceResult<{ revision: string }> | { status: 'conflict' };
export type CreateResult<T> = ServiceResult<T> | { status: 'conflict' } | { status: 'invalid'; message: string };
function isMissing(error: unknown) {
  return ['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as { code?: string }).code ?? '');
}
function contained(root: string, path: string) {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}
function visible(path: string) {
  return !path.split(/[\\/]/).some((part) => part.startsWith('.'));
}
export function decodeDocumentPath(pathname: string): string | undefined {
  try {
    if (!pathname.startsWith('/')) return;
    const parts = pathname.slice(1).split('/').map((part) => decodeURIComponent(part));
    if (parts.some((part) => part.startsWith('.') || /[\\/\u0000-\u001f\u007f]/.test(part))) return;
    if (parts[0] === '_') return;
    return parts.join('/');
  } catch { return; }
}

/** Inject the root getter so filesystem tests never depend on .env or SvelteKit. */
export function createFileReader(getRoot: () => string | undefined) {
  // One process owns the checkout. Serialize saves, including symlink aliases.
  let saving: Promise<unknown> = Promise.resolve();
  async function root(): Promise<string | undefined> {
    const configured = getRoot();
    if (!configured || !isAbsolute(configured)) return;
    try {
      const resolved = await realpath(configured);
      return (await stat(resolved)).isDirectory() ? resolved : undefined;
    } catch { return; }
  }
  async function checkedPath(base: string, logical: string) {
    if (!visible(logical) || logical.includes('\\') || logical.includes('\0')) return;
    const candidate = resolve(base, logical);
    if (!contained(base, candidate)) return;
    const actual = await realpath(candidate);
    if (!contained(base, actual) || !visible(relative(base, actual))) return;
    return actual;
  }
  function validLogical(path: string) {
    return path === '' || (path.isWellFormed() && !isAbsolute(path) && !path.endsWith('/') &&
      !path.split('/').some((part) => !part) && decodeDocumentPath(documentUrl(path)) === path);
  }
  // Follow each segment so a link back to any ancestor cannot create an infinite tree.
  async function directory(base: string, path: string) {
    if (!validLogical(path)) return;
    const ancestors = new Set([base]);
    let logical = '';
    let actual = base;
    for (const part of path ? path.split('/') : []) {
      logical = childPath(logical, part);
      const next = await checkedPath(base, logical);
      if (!next || ancestors.has(next) || !(await stat(next)).isDirectory()) return;
      actual = next;
      ancestors.add(actual);
    }
    return { actual, ancestors };
  }
  async function resolveDirectory(pathname: string): Promise<ServiceResult<{ kind: 'directory'; path: string }>> {
    const logical = decodeDocumentPath(pathname)?.replace(/\/$/, '');
    if (logical === undefined) return missing();
    const base = await root();
    if (!base) return { status: 'unavailable' };
    try {
      if (!await directory(base, logical)) return missing();
      return { status: 'ok', value: { kind: 'directory', path: logical } };
    } catch (error) { if (isMissing(error)) return missing(); throw error; }
  }
  async function list(path: string, depth = 1, warn?: (path: string, message: string) => void): Promise<ServiceResult<DirectoryNode>> {
    if (!validLogical(path) || ((!Number.isInteger(depth) || depth < 0 || depth > 10) && depth !== Infinity)) return missing();
    const base = await root();
    if (!base) return { status: 'unavailable' };
    async function scan(logical: string, remaining: number): Promise<DirectoryNode | undefined> {
      const location = await directory(base!, logical);
      if (!location) return;
      const entries: NavigationEntry[] = [];
      let hasIndex = false;
      let title: string | undefined;
      for (const name of await readdir(location.actual)) {
        const path = childPath(logical, name);
        if (!validLogical(path)) continue;
        try {
          const actual = await checkedPath(base!, path);
          if (!actual) continue;
          const info = await stat(actual);
          if (info.isDirectory()) {
            if (location.ancestors.has(actual)) continue;
            if (remaining > 0) {
              const child = await scan(path, remaining - 1);
              if (child) entries.push(child);
            } else entries.push({ kind: 'directory', name, path, hasIndex: false, hasChildren: false });
          } else if (info.isFile() && Object.hasOwn(documentExtensions, extensionOf(name)) &&
              Object.hasOwn(documentExtensions, extensionOf(actual))) {
            const bytes = await readFile(actual);
            let content: string;
            try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { continue; }
            if (content.includes('\0')) continue;
            const metadata = extensionOf(name) === '.md' ? parseFrontmatter(content) : undefined;
            if (metadata?.warning) warn?.(path, metadata.warning);
            if (name === 'README.md') { hasIndex = true; title = metadata?.title; }
            else entries.push({ kind: 'file', name, path, ...(metadata?.title ? { title: metadata.title } : {}) });
          }
        } catch (error) { if (!isMissing(error)) throw error; }
      }
      entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'directory' ? -1 : 1) ||
        a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }) || a.name.localeCompare(b.name, 'en'));
      return { kind: 'directory', name: logical.split('/').at(-1) ?? '', path: logical,
        hasIndex, ...(title ? { title } : {}), hasChildren: entries.length > 0, ...(remaining > 0 ? { children: entries } : {}) };
    }
    try {
      const result = await scan(path, depth);
      return result ? { status: 'ok', value: result } : missing();
    } catch (error) { if (isMissing(error)) return missing(); throw error; }
  }
  async function resolveFile(pathname: string, asset = false): Promise<ServiceResult<ResolvedFile>> {
    let logical = decodeDocumentPath(pathname);
    if (logical === undefined) return missing();
    const base = await root();
    if (!base) return { status: 'unavailable' };
    try {
      let actual: string | undefined;
      try { actual = await checkedPath(base, logical); }
      catch (error) {
        if (!isMissing(error)) throw error;
        // Exact paths (especially directories) win. Only an absent extensionless
        // leaf tries the ordered page allowlist; assets always require extensions.
        if (!asset && logical && !logical.endsWith('/') && !extensionOf(logical)) {
          for (const extension of Object.keys(documentExtensions)) {
            const candidate = await resolveFile(pathname + extension);
            if (candidate.status !== 'not-found') return candidate;
          }
        }
        return missing();
      }
      if (!actual) return missing();
      let info = await stat(actual);
      if (info.isDirectory() && !asset) {
        const directory = logical.replace(/\/$/, '');
        logical = directory ? `${directory}/README.md` : 'README.md';
        actual = await checkedPath(base, logical);
        if (!actual) return missing();
        info = await stat(actual);
      }
      if (!info.isFile()) return missing();
      const extension = extensionOf(logical);
      const allowed = asset ? imageExtensions : documentExtensions;
      if (!Object.hasOwn(allowed, extension) || !Object.hasOwn(allowed, extensionOf(actual))) return missing();
      return { status: 'ok', value: { kind: asset ? 'asset' : extension === '.md' ? 'markdown' : 'source', path: logical } };
    } catch (error) {
      if (isMissing(error)) return missing();
      throw error;
    }
  }
  async function read(path: string, asset = false): Promise<ServiceResult<Uint8Array>> {
    // Revalidate immediately before reading, including symlink/extension checks.
    const resource = await resolveFile('/' + path.split('/').map(encodeURIComponent).join('/'), asset);
    if (resource.status !== 'ok') return resource;
    const base = await root();
    if (!base) return { status: 'unavailable' };
    try {
      const actual = await checkedPath(base, resource.value.path);
      if (!actual || !(await stat(actual)).isFile()) return missing();
      return { status: 'ok', value: await readFile(actual) };
    } catch (error) {
      if (isMissing(error)) return missing();
      throw error;
    }
  }
  async function write(path: string, content: string, originalRevision: string): Promise<SaveResult> {
    const resource = await resolveFile('/' + path.split('/').map(encodeURIComponent).join('/'));
    if (resource.status !== 'ok') return resource;
    // Saving never creates a page or resolves an abbreviated filename.
    if (resource.value.path !== path) return missing();
    const base = await root();
    if (!base) return { status: 'unavailable' };
    let temporary: string | undefined;
    try {
      const actual = await checkedPath(base, path);
      if (!actual) return missing();
      const info = await stat(actual);
      if (!info.isFile()) return missing();
      const current = await readFile(actual);
      try {
        if (new TextDecoder('utf-8', { fatal: true }).decode(current).includes('\0')) return missing();
      } catch { return missing(); }
      if (revisionOf(current) !== originalRevision) return { status: 'conflict' };
      const revision = revisionOf(content);
      if (revision === originalRevision) return { status: 'ok', value: { revision } };
      temporary = resolve(dirname(actual), `.wiki-save-${crypto.randomUUID()}`);
      const handle = await open(temporary, 'wx', info.mode & 0o777);
      try {
        await handle.writeFile(content, 'utf8');
        await handle.chmod(info.mode & 0o777);
        await handle.sync();
      } finally { await handle.close(); }
      // Recheck manual changes and path replacements before atomic replacement.
      if (await checkedPath(base, path) !== actual ||
          await realpath(dirname(actual)) !== dirname(actual) ||
          revisionOf(await readFile(actual)) !== originalRevision) return { status: 'conflict' };
      await rename(temporary, actual);
      temporary = undefined;
      return { status: 'ok', value: { revision } };
    } catch (error) {
      if (isMissing(error)) return missing();
      throw error;
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
    }
  }
  function serialize<T>(action: () => Promise<T>): Promise<T> {
    const operation = saving.then(action);
    saving = operation.catch(() => {});
    return operation;
  }
  function save(path: string, content: string, originalRevision: string): Promise<SaveResult> {
    return serialize(() => write(path, content, originalRevision));
  }
  function createDocument(parentPath: string, content: string): Promise<CreateResult<{ path: string; revision: string }>> {
    return serialize(async () => {
      const stem = documentStem(content);
      if (!stem) return { status: 'invalid', message: 'Add a front matter title or top-level H1 containing letters or numbers before saving.' };
      if (content.includes('\0') || !content.isWellFormed() || !validLogical(parentPath)) return { status: 'invalid', message: 'Invalid document' };
      const base = await root();
      if (!base) return { status: 'unavailable' };
      let temporary: string | undefined;
      try {
        const parent = await directory(base, parentPath);
        if (!parent) return missing();
        temporary = resolve(parent.actual, `.wiki-create-${crypto.randomUUID()}`);
        const handle = await open(temporary, 'wx', 0o644);
        try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
        for (let number = 1; ; number++) {
          if ((await directory(base, parentPath))?.actual !== parent.actual ||
              await realpath(parent.actual) !== parent.actual) return missing();
          const name = documentFilename(stem, number);
          try {
            // Linking a completed temporary file is atomic and never replaces an existing entry.
            await link(temporary, resolve(parent.actual, name));
            return { status: 'ok', value: { path: childPath(parentPath, name), revision: revisionOf(content) } };
          } catch (error) { if ((error as { code?: string }).code !== 'EEXIST') throw error; }
        }
      } catch (error) { if (isMissing(error)) return missing(); throw error; }
      finally { if (temporary) await unlink(temporary).catch(() => {}); }
    });
  }
  function createFolder(parentPath: string, inputName: string): Promise<CreateResult<{ path: string }>> {
    return serialize(async () => {
      const name = inputName.trim();
      const path = childPath(parentPath, name);
      if (!name || name.includes('/') || !name.isWellFormed() || Buffer.byteLength(name) > 255 ||
          !validLogical(parentPath) || !validLogical(path)) return { status: 'invalid', message: 'Enter a valid folder name without slashes or a leading dot.' };
      const base = await root();
      if (!base) return { status: 'unavailable' };
      let created: { actual: string; ino: number; dev: number } | undefined;
      let index: { actual: string; ino: number; dev: number } | undefined;
      try {
        const parent = await directory(base, parentPath);
        if (!parent || await realpath(parent.actual) !== parent.actual) return missing();
        const actual = resolve(parent.actual, name);
        await mkdir(actual);
        const info = await stat(actual);
        created = { actual, ino: info.ino, dev: info.dev };
        if ((await directory(base, parentPath))?.actual !== parent.actual || await checkedPath(base, path) !== actual) return missing();
        const handle = await open(resolve(actual, 'README.md'), 'wx', 0o644);
        try {
          const indexInfo = await handle.stat();
          index = { actual: resolve(actual, 'README.md'), ino: indexInfo.ino, dev: indexInfo.dev };
        } finally { await handle.close(); }
        created = undefined;
        index = undefined;
        return { status: 'ok', value: { path } };
      } catch (error) {
        if ((error as { code?: string }).code === 'EEXIST') return { status: 'conflict' };
        if (isMissing(error)) return missing();
        throw error;
      } finally {
        if (index) {
          const info = await stat(index.actual).catch(() => undefined);
          if (info?.ino === index.ino && info.dev === index.dev && info.isFile() && info.size === 0) await unlink(index.actual).catch(() => {});
        }
        if (created) {
          // rmdir only removes an empty directory; never recursively delete another writer's data.
          const info = await stat(created.actual).catch(() => undefined);
          if (info?.ino === created.ino && info.dev === created.dev) await rmdir(created.actual).catch(() => {});
        }
      }
    });
  }
  return { resolve: resolveFile, resolveDirectory, read, list, save, createDocument, createFolder };
}
