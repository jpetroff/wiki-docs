import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNavigationCache, parseNavigationCache, writeNavigationCache } from './cache';
import { createFileReader } from './filesystem';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'wiki-cache-'));
  temporary.push(base);
  const root = join(base, 'docs');
  await mkdir(root);
  const output = join(base, 'build', 'navigation.yaml');
  return { base, root, output, cache: createNavigationCache(() => root, () => output) };
}

test('round trips full trees beyond ten levels with README titles and existing visibility rules', async () => {
  const { base, root, output, cache } = await fixture();
  const deep = Array.from({ length: 12 }, (_, i) => `level${i}`).join('/');
  await mkdir(join(root, deep), { recursive: true });
  await Promise.all([
    writeFile(join(root, 'README.md'), '---\ntitle: "Root \\"title\\""\n---\n# Body'),
    writeFile(join(root, 'file10.md'), '---\ntitle: Zed\nextra: [1, 2]\n---\nSecret body'),
    writeFile(join(root, 'file2.md'), '# Heading does not label navigation'),
    writeFile(join(root, 'source.yaml'), 'title: Not front matter'),
    writeFile(join(root, '.hidden.md'), 'Hidden'),
    writeFile(join(root, 'binary.md'), new Uint8Array([0xff])),
    writeFile(join(root, 'nul.md'), 'a\0b'),
    writeFile(join(root, 'image.png'), 'Image'),
    writeFile(join(root, deep, 'README.md'), '---\ntitle: Deep title\n---\nBody'),
    writeFile(join(root, deep, 'page.md'), 'Page'),
    writeFile(join(base, 'outside.md'), 'Outside')
  ]);
  await symlink(root, join(root, 'cycle'));
  await symlink(join(base, 'outside.md'), join(root, 'escape.md'));
  await symlink(join(root, 'file2.md'), join(root, 'alias.md'));
  await writeNavigationCache(root, output);
  const text = await readFile(output, 'utf8');
  expect(text).not.toContain('Secret body');
  expect(text).not.toContain('extra');
  expect(text).not.toContain(root);
  const tree = parseNavigationCache(text, await realpath(root));
  expect(tree.title).toBe('Root "title"');
  expect(tree.children!.map((entry) => entry.name)).toEqual(['level0', 'alias.md', 'file2.md', 'file10.md', 'source.yaml']);
  expect(tree.children!.find((entry) => entry.name === 'file2.md')?.title).toBe('file2.md');
  expect(tree.children!.find((entry) => entry.name === 'file10.md')?.title).toBe('Zed');
  expect(await cache.list(deep)).toMatchObject({ status: 'ok', value: { title: 'Deep title', hasIndex: true,
    children: [{ name: 'page.md' }] } });
  const shallow = await cache.list('', 0);
  expect(shallow).toMatchObject({ status: 'ok', value: { hasChildren: true } });
  if (shallow.status === 'ok') expect(shallow.value.children).toBeUndefined();
  expect(await cache.list('../')).toEqual({ status: 'not-found' });
});

test('cache is manual, replacement is detected, and failed scans preserve the prior snapshot', async () => {
  const { root, output, cache } = await fixture();
  expect(await cache.tree()).toEqual({ status: 'unavailable' });
  await writeFile(join(root, 'README.md'), '---\ntitle: First\n---\nBody');
  await writeNavigationCache(root, output);
  const first = await cache.tree();
  expect(first).toMatchObject({ status: 'ok', value: { title: 'First' } });
  await writeFile(join(root, 'README.md'), '---\ntitle: Next\n---\nBody');
  expect(await cache.tree()).toEqual(first);
  await writeNavigationCache(root, output);
  expect(await cache.tree()).toMatchObject({ status: 'ok', value: { title: 'Next' } });
  const previous = await readFile(output, 'utf8');
  await expect(writeNavigationCache(join(root, 'missing'), output)).rejects.toThrow();
  expect(await readFile(output, 'utf8')).toBe(previous);
  await writeFile(output, 'broken = [');
  expect(await cache.tree()).toEqual({ status: 'unavailable' });
  await writeNavigationCache(root, output);
  expect((await cache.tree()).status).toBe('ok');
});

test('malformed metadata warns and direct reads and creation remain live without a cache', async () => {
  const { root, output, cache } = await fixture();
  const reader = createFileReader(() => root);
  const created = await reader.createDocument('', '---\ntitle: Fresh\n---\nBody');
  expect(created).toMatchObject({ status: 'ok', value: { path: 'fresh.md' } });
  expect(await reader.resolve('/fresh.md')).toMatchObject({ status: 'ok' });
  expect(await reader.read('fresh.md')).toMatchObject({ status: 'ok' });
  expect(await cache.tree()).toEqual({ status: 'unavailable' });
  await writeFile(join(root, 'bad.md'), '---\ntitle: [broken\n---\nBody');
  const warnings: string[] = [];
  await writeNavigationCache(root, output, (path) => warnings.push(path));
  expect(warnings).toEqual(['bad.md']);
  expect(await cache.list('')).toMatchObject({ status: 'ok', value: { children: [
    { name: 'bad.md' }, { name: 'fresh.md', title: 'Fresh' }
  ] } });
  const other = createNavigationCache(() => join(root, '..'), () => output);
  expect(await other.tree()).toEqual({ status: 'unavailable' });
});

test('rejects incompatible and structurally invalid snapshots', async () => {
  const { root, output } = await fixture();
  await writeNavigationCache(root, output);
  const content = await readFile(output, 'utf8');
  const header = content.split('\n', 1)[0] + '\n';
  for (const entry of [
    {}, { title: 'Root', items: 'invalid' },
    { title: 'Root', items: [{ title: 'Page', href: 'missing/x.md' }] },
    { title: 'Root', items: [{ title: 'Page', href: 'x.md' }, { title: 'Duplicate', href: 'x.md' }] },
    { title: 'Root', items: [{ title: 'Page', href: '../x.md' }] },
    { title: 'Root', href: '/README.md', items: [] },
    { title: 'Root', items: [{ title: 'Section', items: [] }] },
    { title: 'Root', items: [{ title: 'Section', href: 'section/page.md', items: [] }] }
  ]) {
    expect(() => parseNavigationCache(header + Bun.YAML.stringify(entry, null, 2), root)).toThrow();
  }
  expect(() => parseNavigationCache(content.replace('wiki-navigation-v2', 'wiki-navigation-v1'), root)).toThrow();
});

test('writes readable nested YAML and preserves sections without README files', async () => {
  const { root, output, cache } = await fixture();
  await mkdir(join(root, 'section'));
  await mkdir(join(root, 'empty'));
  await mkdir(join(root, 'guide'));
  await Promise.all([
    writeFile(join(root, 'README.md'), '---\ntitle: Documentation\n---'),
    writeFile(join(root, 'section', 'page.md'), '---\ntitle: "A: special title"\n---'),
    writeFile(join(root, 'guide', 'README.md'), '---\ntitle: Guide\n---'),
    writeFile(join(root, 'guide', 'page.md'), 'Page')
  ]);
  expect(await writeNavigationCache(root, output)).toBe(6);
  const content = await readFile(output, 'utf8');
  expect(content).toContain('title: Documentation\nhref: README.md\nitems:');
  expect(content).toContain('  - title: empty');
  expect(Bun.YAML.parse(content)).toEqual({ title: 'Documentation', href: 'README.md', items: [
    { title: 'empty', path: 'empty', items: [] },
    { title: 'Guide', href: 'guide/README.md', items: [{ title: 'page.md', href: 'guide/page.md' }] },
    { title: 'section', path: 'section', items: [{ title: 'A: special title', href: 'section/page.md' }] }
  ] });
  expect(await cache.list('empty')).toMatchObject({ status: 'ok', value: { hasIndex: false, children: [] } });
  expect(await cache.list('section')).toMatchObject({ status: 'ok', value: { hasIndex: false,
    children: [{ path: 'section/page.md', title: 'A: special title' }] } });
});
