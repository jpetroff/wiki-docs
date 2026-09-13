import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileReader } from './filesystem';
import { documentExtensions, imageExtensions } from '../../shared/highlighting';

let scratch: string;
let root: string;
const files = createFileReader(() => root);
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'wiki-resolver-'));
  root = join(scratch, 'docs');
  await mkdir(join(root, 'guide'), { recursive: true });
  await mkdir(join(root, 'empty'));
  await mkdir(join(root, '.private'));
  await writeFile(join(root, 'README.md'), '# Home');
  await writeFile(join(root, 'guide', 'README.md'), '# Guide');
  await writeFile(join(root, 'guide.md'), '# Shadowed');
  await writeFile(join(root, 'empty.md'), '# Shadowed empty directory');
  await writeFile(join(root, 'choice.sh'), 'echo first');
  await writeFile(join(root, 'choice.txt'), 'second');
  await writeFile(join(root, 'empty', 'readme.md'), '# Lowercase');
  await writeFile(join(root, '.private', 'secret.md'), 'hidden');
  await writeFile(join(scratch, 'outside.md'), 'outside');
  await writeFile(join(root, 'config.env'), 'private');
  await symlink(join(root, 'config.env'), join(root, 'disguised.md'));
  for (const ext of [...Object.keys(documentExtensions), ...Object.keys(imageExtensions)]) {
    await writeFile(join(root, 'example' + ext), 'contents');
  }
  for (const ext of Object.keys(documentExtensions)) {
    await writeFile(join(root, 'guide', 'only-' + ext.slice(1) + ext), 'contents');
  }
  await writeFile(join(root, 'a #é%.md'), 'encoded');
  await symlink(join(root, 'README.md'), join(root, 'inside.md'));
  await symlink(join(scratch, 'outside.md'), join(root, 'outside.md'));
  await symlink(join(root, '.private', 'secret.md'), join(root, 'hidden.md'));
  await symlink(join(root, 'guide'), join(root, 'alias'));
});
afterAll(() => rm(scratch, { recursive: true, force: true }));
describe('documentation resolution', () => {
  test.each(Object.keys(documentExtensions))('resolves an extensionless %s file', async (ext) => {
    const path = 'guide/only-' + ext.slice(1);
    const result = await files.resolve('/' + path);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.value.path).toBe(path + ext);
  });
  test('uses allowlist order and preserves exact directory precedence', async () => {
    for (const [url, path] of [['/example', 'example.md'], ['/choice', 'choice.sh'], ['/guide', 'guide/README.md']]) {
      const result = await files.resolve(url);
      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.value.path).toBe(path);
    }
    for (const url of ['/empty', '/choice.md', '/choice/', '/outside', '/hidden', '/disguised', '/absent']) {
      expect((await files.resolve(url)).status).toBe('not-found');
    }
    expect((await files.resolve('/example', true)).status).toBe('not-found');
    const encoded = await files.resolve('/a%20%23%C3%A9%25');
    expect(encoded.status).toBe('ok');
    if (encoded.status === 'ok') expect(encoded.value.path).toBe('a #é%.md');
  });
  test.each(['/', '/guide', '/guide/', '/guide/README.md', '/inside.md', '/alias'])('%s resolves Markdown', async (path) => {
    const result = await files.resolve(path);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.value.kind).toBe('markdown');
  });
  test.each(Object.keys(documentExtensions))('allows %s as a document', async (ext) => {
    expect((await files.resolve('/example' + ext)).status).toBe('ok');
  });
  test.each(['/missing.md', '/empty', '/example.svg', '/example.png', '/.private/secret.md', '/outside.md', '/hidden.md', '/disguised.md', '/%2e%2e/outside.md', '/guide/%2e%2e/README.md', '/guide%2fREADME.md', '/%00.md', '/%zz', '/_/%61pp', '/example.sh/'])('%s is not found', async (path) => {
    expect((await files.resolve(path)).status).toBe('not-found');
  });
  test('encodes and decodes filenames exactly once', async () => {
    const result = await files.resolve('/a%20%23%C3%A9%25.md');
    expect(result).toEqual({ status: 'ok', value: { kind: 'markdown', path: 'a #é%.md' } });
    expect((await files.read('a #é%.md')).status).toBe('ok');
  });
  test.each(Object.keys(imageExtensions))('serves %s only as an asset', async (ext) => {
    expect((await files.resolve('/example' + ext, true)).status).toBe('ok');
  });
  test('asset endpoint rejects documents and directories', async () => {
    expect((await files.resolve('/README.md', true)).status).toBe('not-found');
    expect((await files.resolve('/guide', true)).status).toBe('not-found');
  });
  test('missing, relative, nonexistent, or file roots are unavailable', async () => {
    for (const root of [undefined, 'relative', join(scratch, 'absent'), join(scratch, 'outside.md')]) {
      expect((await createFileReader(() => root).resolve('/')).status).toBe('unavailable');
    }
  });
});
