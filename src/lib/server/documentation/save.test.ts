import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, stat, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileReader, revisionOf } from './filesystem';

let scratch: string;
let root: string;
const files = createFileReader(() => root);
beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'wiki-save-'));
  root = join(scratch, 'docs');
  await mkdir(root);
  await mkdir(join(root, '.private'));
  await writeFile(join(root, '.private', 'secret.md'), 'secret');
  await writeFile(join(scratch, 'outside.md'), 'outside');
  await symlink(join(scratch, 'outside.md'), join(root, 'outside.md'));
  await symlink(join(root, '.private', 'secret.md'), join(root, 'hidden.md'));
});
afterAll(() => rm(scratch, { recursive: true, force: true }));

test('saves Markdown and source exactly, preserving permissions and no-op mtime', async () => {
  for (const path of ['README.md', 'script.sh', 'config.json']) {
    const before = 'original\r\n';
    const after = '\uFEFFupdated\r\n';
    await writeFile(join(root, path), before, { mode: 0o750 });
    const result = await files.save(path, after, revisionOf(before));
    expect(result).toEqual({ status: 'ok', value: { revision: revisionOf(after) } });
    expect(await readFile(join(root, path), 'utf8')).toBe(after);
    const info = await stat(join(root, path));
    expect(info.mode & 0o777).toBe(0o750);
    expect((await files.save(path, after, revisionOf(after))).status).toBe('ok');
    expect((await stat(join(root, path))).mtimeMs).toBe(info.mtimeMs);
  }
  expect((await readdir(root)).some((name) => name.startsWith('.wiki-save-'))).toBe(false);
});

test('stale and simultaneous saves cannot overwrite newer content, including aliases', async () => {
  await writeFile(join(root, 'race.md'), 'before');
  await symlink(join(root, 'race.md'), join(root, 'alias.md'));
  const results = await Promise.all([
    files.save('race.md', 'first', revisionOf('before')),
    files.save('alias.md', 'second', revisionOf('before'))
  ]);
  expect(results.map((result) => result.status)).toEqual(['ok', 'conflict']);
  expect(await readFile(join(root, 'race.md'), 'utf8')).toBe('first');
  await writeFile(join(root, 'race.md'), 'manual change');
  expect((await files.save('alias.md', 'stale', revisionOf('first'))).status).toBe('conflict');
  expect(await readFile(join(root, 'race.md'), 'utf8')).toBe('manual change');
});

test('rejects traversal, private paths, missing pages, aliases outside root, and binary files', async () => {
  await writeFile(join(root, 'binary.txt'), new Uint8Array([0xff]));
  for (const path of ['../outside.md', '/outside.md', 'outside.md', 'hidden.md', '.private/secret.md', 'new.md', 'binary.txt', 'README', '']) {
    expect((await files.save(path, 'overwritten', revisionOf('outside'))).status).toBe('not-found');
  }
  expect(await readFile(join(scratch, 'outside.md'), 'utf8')).toBe('outside');
});
