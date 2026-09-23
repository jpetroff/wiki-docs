import { mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { childPath, entryTitle, parentPath, type DirectoryNode, type NavigationEntry } from '../../shared/navigation';
import type { ServiceResult } from '../../shared/result';
import { createFileReader, decodeDocumentPath, revisionOf } from './filesystem';
import { documentUrl } from '../../shared/navigation';

interface CacheEntry { title: string; href?: string; path?: string; items?: CacheEntry[] }
const fingerprint = (root: string) => revisionOf(root);

export async function writeNavigationCache(docsDir: string | undefined, destination: string,
  warn: (path: string, message: string) => void = () => {}) {
  if (!docsDir || !isAbsolute(docsDir)) throw new Error('DOCS_DIR must be an absolute documentation directory');
  const root = await realpath(docsDir);
  const result = await createFileReader(() => root).list('', Infinity, warn);
  if (result.status !== 'ok') throw new Error('Documentation directory unavailable');
  let count = 0;
  function serialize(entry: NavigationEntry): CacheEntry {
    count++;
    return {
      title: entryTitle(entry),
      ...(entry.kind === 'file' ? { href: entry.path } : entry.hasIndex
        ? { href: childPath(entry.path, 'README.md') }
        : entry.path ? { path: entry.path } : {}),
      ...(entry.kind === 'directory' ? { items: (entry.children ?? []).map(serialize) } : {})
    };
  }
  // Keep internal snapshot identity outside the readable navigation tree.
  const content = `# wiki-navigation-v2 ${fingerprint(root)}\n` +
    Bun.YAML.stringify(serialize(result.value), null, 2) + '\n';
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
    await rename(temporary, destination);
  } finally { await unlink(temporary).catch(() => {}); }
  return count;
}

/** Validate our cache format, not arbitrary author front matter. */
export function parseNavigationCache(content: string, root: string): DirectoryNode {
  if (content.split('\n', 1)[0] !== `# wiki-navigation-v2 ${fingerprint(root)}`) {
    throw new Error('Incompatible navigation cache');
  }
  const seen = new Set<string>();
  function parse(raw: unknown, parent: string, isRoot = false): NavigationEntry {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid cache entry');
    const { title, href, path: sectionPath, items } = raw as Record<string, unknown>;
    if (typeof title !== 'string' || !title.trim() ||
        (href !== undefined && (typeof href !== 'string' || !href)) ||
        (sectionPath !== undefined && typeof sectionPath !== 'string') ||
        (items !== undefined && !Array.isArray(items))) throw new Error('Invalid cache entry');
    const directory = Array.isArray(items);
    const hasIndex = typeof href === 'string' && href.split('/').at(-1) === 'README.md';
    if ((directory && href !== undefined && !hasIndex) ||
        (!directory && (href === undefined || hasIndex)) ||
        (sectionPath !== undefined && (!directory || href !== undefined))) throw new Error('Invalid cache entry');
    const path = directory ? (hasIndex ? parentPath(href as string) : sectionPath ?? (isRoot ? '' : undefined)) : href;
    if (typeof path !== 'string' || seen.has(path) ||
        (isRoot ? !directory || path !== '' : !path || parentPath(path) !== parent) ||
        (path !== '' && (path.endsWith('/') || path.split('/').some((part) => !part) ||
          decodeDocumentPath(documentUrl(path)) !== path))) throw new Error('Invalid cache entry');
    // Validate the href itself too (including redundant separators before README).
    if (href !== undefined && href !== (directory ? childPath(path, 'README.md') : path)) {
      throw new Error('Invalid cache href');
    }
    seen.add(path);
    const common = { name: path.split('/').at(-1) ?? '', path, title };
    if (!directory) return { ...common, kind: 'file' };
    const children = (items as unknown[]).map((item) => parse(item, path));
    return { ...common, kind: 'directory', hasIndex, hasChildren: children.length > 0, children };
  }
  return parse(Bun.YAML.parse(content), '', true) as DirectoryNode;
}

export function createNavigationCache(getRoot: () => string | undefined, getPath: () => string) {
  let loaded: { key: string; tree: DirectoryNode; folders: Map<string, DirectoryNode> } | undefined;
  async function snapshot() {
    const configured = getRoot();
    if (!configured || !isAbsolute(configured)) return;
    try {
      const root = await realpath(configured);
      if (!(await stat(root)).isDirectory()) return;
      const path = getPath();
      const info = await stat(path, { bigint: true });
      const key = `${root}:${path}:${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
      if (loaded?.key === key) return loaded;
      const tree = parseNavigationCache(await readFile(path, 'utf8'), root);
      const folders = new Map<string, DirectoryNode>();
      const pending = [tree];
      while (pending.length) {
        const folder = pending.pop()!;
        folders.set(folder.path, folder);
        for (const child of folder.children!) if (child.kind === 'directory') pending.push(child);
      }
      loaded = { key, tree, folders };
      return loaded;
    } catch { loaded = undefined; return; }
  }
  return {
    async tree(): Promise<ServiceResult<DirectoryNode>> {
      const cache = await snapshot();
      return cache ? { status: 'ok', value: cache.tree } : { status: 'unavailable' };
    },
    async list(path: string, depth = 1): Promise<ServiceResult<DirectoryNode>> {
      if (!Number.isInteger(depth) || depth < 0 || depth > 10 ||
          (path !== '' && (path.endsWith('/') || path.split('/').some((part) => !part) ||
            decodeDocumentPath(documentUrl(path)) !== path))) return { status: 'not-found' };
      const cache = await snapshot();
      if (!cache) return { status: 'unavailable' };
      const folder = cache.folders.get(path);
      if (!folder) return { status: 'not-found' };
      function slice(node: DirectoryNode, remaining: number): DirectoryNode {
        const { children, ...metadata } = node;
        return { ...metadata, ...(remaining > 0 ? {
          children: children!.map((child) => child.kind === 'directory' ? slice(child, remaining - 1) : child)
        } : {}) };
      }
      return { status: 'ok', value: slice(folder, depth) };
    }
  };
}
