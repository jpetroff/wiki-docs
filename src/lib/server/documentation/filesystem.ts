import { realpath, stat, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { documentExtensions, imageExtensions, extensionOf } from '../../shared/highlighting';
import type { ServiceResult } from '../../shared/result';

export interface ResolvedFile {
  kind: 'markdown' | 'source' | 'asset';
  /** Decoded, root-relative logical path, never an absolute filesystem path. */
  path: string;
}
const missing = (): ServiceResult<never> => ({ status: 'not-found' });
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
  return { resolve: resolveFile, read };
}
