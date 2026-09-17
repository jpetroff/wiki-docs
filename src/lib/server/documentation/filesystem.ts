import { realpath, stat, readFile, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { documentExtensions, imageExtensions, extensionOf } from '../../shared/highlighting';
import type { ServiceResult } from '../../shared/result';

export interface ResolvedFile {
  kind: 'markdown' | 'source' | 'asset';
  /** Decoded, root-relative logical path, never an absolute filesystem path. */
  path: string;
}
const missing = (): ServiceResult<never> => ({ status: 'not-found' });
export const revisionOf = (bytes: string | Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
export type SaveResult = ServiceResult<{ revision: string }> | { status: 'conflict' };
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
  function save(path: string, content: string, originalRevision: string): Promise<SaveResult> {
    const operation = saving.then(() => write(path, content, originalRevision));
    saving = operation.catch(() => {});
    return operation;
  }
  return { resolve: resolveFile, read, save };
}
