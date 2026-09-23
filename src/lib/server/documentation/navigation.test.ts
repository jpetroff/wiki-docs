import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileReader, revisionOf } from './filesystem';
import { documentFilename, documentStem } from './filenames';

let scratch: string;
let root: string;
const files = createFileReader(() => root);
beforeAll(async () => {
  scratch = await fs.mkdtemp(join(tmpdir(), 'wiki-navigation-'));
  root = join(scratch, 'docs');
  for (const path of ['', 'guide/deeper', 'empty', 'index-only', '.hidden', '_']) await fs.mkdir(join(root, path), { recursive: true });
  for (const [path, content] of Object.entries({
    'README.md': '# Home', 'guide/README.md': '# Guide', 'guide/page2.md': '# Two',
    'guide/page10.md': '# Ten', 'guide/deeper/example.txt': 'Hello', 'index-only/README.md': '',
    'a #é%.md': '# Encoded', 'readme.md': '# Ordinary page', 'script.sh': 'echo hello',
    'image.png': 'image', 'secret.env': 'secret', '.hidden/page.md': '# Private', '_/page.md': '# Reserved'
  })) await fs.writeFile(join(root, path), content);
  await fs.writeFile(join(root, 'binary.txt'), new Uint8Array([0xff]));
  await fs.writeFile(join(scratch, 'outside.md'), '# Outside');
  await fs.symlink(join(scratch, 'outside.md'), join(root, 'outside.md'));
  await fs.symlink(join(root, '.hidden/page.md'), join(root, 'private.md'));
  await fs.symlink(join(root, 'secret.env'), join(root, 'disguised.md'));
  await fs.symlink(join(root, 'guide'), join(root, 'alias'));
  await fs.symlink(root, join(root, 'guide/back'));
  await fs.symlink(join(root, 'guide'), join(root, 'guide/self'));
});
afterAll(() => fs.rm(scratch, { recursive: true, force: true }));

test('lists visible readable entries with natural folder-first ordering and no indexes', async () => {
  const result = await files.list('');
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') return;
  expect(result.value.hasIndex).toBe(true);
  expect(result.value.children?.map((child) => child.name)).toEqual(['alias', 'empty', 'guide', 'index-only', 'a #é%.md', 'readme.md', 'script.sh']);
  expect(result.value.children?.find((child) => child.name === 'empty')).toEqual({ kind: 'directory', name: 'empty', path: 'empty', hasIndex: false, hasChildren: false });
  expect(result.value.children?.find((child) => child.name === 'index-only')).toEqual({ kind: 'directory', name: 'index-only', path: 'index-only', hasIndex: true, hasChildren: false });
  const guide = await files.list('guide');
  expect(guide.status === 'ok' && guide.value.children?.map((child) => child.name)).toEqual(['deeper', 'page2.md', 'page10.md']);
});

test('honors starting points and depth, including zero and bounded recursion through aliases', async () => {
  const zero = await files.list('guide', 0);
  expect(zero).toEqual({ status: 'ok', value: { kind: 'directory', name: 'guide', path: 'guide', hasIndex: true, hasChildren: true } });
  const deep = await files.list('alias', 2);
  expect(deep.status === 'ok' && deep.value.children?.[0]).toEqual({ kind: 'directory', name: 'deeper', path: 'alias/deeper', hasIndex: false, hasChildren: true,
    children: [{ kind: 'file', name: 'example.txt', path: 'alias/deeper/example.txt' }] });
  expect((await files.list('', 10)).status).toBe('ok');
  for (const depth of [-1, 11, 1.5, NaN]) expect((await files.list('', depth)).status).toBe('not-found');
  for (const path of ['guide/back', 'guide/self', '../', '/guide', '_', '.hidden', 'outside.md', 'guide//deeper', 'missing', 'a #é%.md']) {
    expect((await files.list(path)).status).toBe('not-found');
  }
  expect((await createFileReader(() => undefined).list('')).status).toBe('unavailable');
});

test('resolves directories independently of README and preserves exact encoded paths', async () => {
  expect(await files.resolveDirectory('/empty/')).toEqual({ status: 'ok', value: { kind: 'directory', path: 'empty' } });
  expect(await files.resolveDirectory('/')).toEqual({ status: 'ok', value: { kind: 'directory', path: '' } });
  expect((await files.resolveDirectory('/guide/page2')).status).toBe('not-found');
  expect((await files.resolveDirectory('/guide%2fdeeper')).status).toBe('not-found');
  expect((await files.resolve('/a%20%23%C3%A9%25.md')).status).toBe('ok');
});

test('extracts the first top-level H1 and makes Unicode filenames without changing source', () => {
  expect(documentStem('---\nother: Ignored\n---\n```md\n# Wrong\n```\n> # Wrong\n\n## Wrong\n\n# **Héllo** [世界](url) `API`!\n# Later')).toBe('héllo-世界-api');
  expect(documentStem('Title\n=====')).toBe('title');
  expect(documentStem('# !!!\n# Later')).toBeUndefined();
  expect(documentStem('## No title')).toBeUndefined();
  expect(documentStem('# Cafe\u0301')).toBe('café');
  expect(documentStem('# <em>Plain</em> &amp; simple')).toBe('plain-simple');
  expect(documentStem('# ../../Private \\ folder')).toBe('private-folder');
  for (const number of [1, 2, 1000]) {
    const name = documentFilename('界'.repeat(150), number);
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(255);
    expect(name.isWellFormed()).toBe(true);
    expect(name.endsWith(number === 1 ? '.md' : `-${number}.md`)).toBe(true);
  }
});

test('creates numbered documents exclusively, preserves content, and supports subsequent saves', async () => {
  const content = '\uFEFF---\r\ncustom: true\r\n---\r\n# New **Page**\r\n\r\nBody\r\n';
  const [first, second] = await Promise.all([files.createDocument('guide', content), files.createDocument('guide', content)]);
  expect(first).toEqual({ status: 'ok', value: { path: 'guide/new-page.md', revision: revisionOf(content) } });
  expect(second).toEqual({ status: 'ok', value: { path: 'guide/new-page-2.md', revision: revisionOf(content) } });
  expect(await fs.readFile(join(root, 'guide/new-page.md'), 'utf8')).toBe(content);
  expect((await files.save('guide/new-page.md', '# Renamed title', revisionOf(content))).status).toBe('ok');
  expect(await fs.readFile(join(root, 'guide/new-page-2.md'), 'utf8')).toBe(content);
  await fs.mkdir(join(root, 'occupied.md'));
  expect(await files.createDocument('', '# Occupied')).toEqual({ status: 'ok', value: { path: 'occupied-2.md', revision: revisionOf('# Occupied') } });
  expect((await fs.readdir(join(root, 'guide'))).some((name) => name.startsWith('.wiki-create-'))).toBe(false);
});

test('creates folders with blank indexes, rejects collisions and invalid creation paths', async () => {
  expect(await files.createFolder('', '  Folder #é%  ')).toEqual({ status: 'ok', value: { path: 'Folder #é%' } });
  expect(await fs.readFile(join(root, 'Folder #é%/README.md'), 'utf8')).toBe('');
  expect((await files.resolveDirectory('/Folder%20%23%C3%A9%25')).status).toBe('ok');
  expect((await files.createFolder('', 'Folder #é%')).status).toBe('conflict');
  for (const name of ['', '.', '..', '.private', 'a/b', 'a\\b', '_', 'bad\0name', 'x'.repeat(256)]) {
    expect((await files.createFolder('', name)).status).toBe('invalid');
  }
  for (const path of ['../outside', '/guide', '.hidden', '_', 'guide/back', 'guide/self', 'missing', '\uD800']) {
    expect((await files.createDocument(path, '# Blocked')).status).not.toBe('ok');
    expect((await files.createFolder(path, 'Blocked')).status).not.toBe('ok');
  }
  expect((await files.createDocument('', 'No heading')).status).toBe('invalid');
  expect((await files.createDocument('', '# Bad\0content')).status).toBe('invalid');
});

test('exclusive creation handles independent writers without overwriting either document', async () => {
  const other = createFileReader(() => root);
  const inputs = ['# Concurrent\n\nFirst writer', '# Concurrent\n\nSecond writer'];
  const results = await Promise.all([files.createDocument('', inputs[0]), other.createDocument('', inputs[1])]);
  const paths: string[] = [];
  for (const [index, result] of results.entries()) {
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') continue;
    paths.push(result.value.path);
    expect(await fs.readFile(join(root, result.value.path), 'utf8')).toBe(inputs[index]);
  }
  expect(paths.sort()).toEqual(['concurrent-2.md', 'concurrent.md']);
});

test('failed document publication removes its temporary file without touching existing content', async () => {
  const mock = spyOn(fs, 'link').mockRejectedValue(Object.assign(new Error('Injected link failure'), { code: 'EIO' }));
  try { await expect(files.createDocument('', '# Failed publication')).rejects.toThrow('Injected link failure'); }
  finally { mock.mockRestore(); }
  expect(await fs.stat(join(root, 'failed-publication.md')).catch(() => null)).toBeNull();
  expect((await fs.readdir(root)).some((name) => name.startsWith('.wiki-create-'))).toBe(false);
  expect(await fs.readFile(join(root, 'README.md'), 'utf8')).toBe('# Home');
});

test('failed index creation removes only the newly created empty folder', async () => {
  const originalOpen = fs.open;
  const mock = spyOn(fs, 'open').mockImplementation(((path: string, ...args: Parameters<typeof fs.open> extends [unknown, ...infer T] ? T : never) => {
    if (String(path).endsWith('/failed-folder/README.md')) throw Object.assign(new Error('Injected write failure'), { code: 'EIO' });
    return originalOpen(path, ...args);
  }) as typeof fs.open);
  try { await expect(files.createFolder('', 'failed-folder')).rejects.toThrow('Injected write failure'); }
  finally { mock.mockRestore(); }
  expect(await fs.stat(join(root, 'failed-folder')).catch(() => null)).toBeNull();
  expect(await fs.readFile(join(root, 'README.md'), 'utf8')).toBe('# Home');
});
