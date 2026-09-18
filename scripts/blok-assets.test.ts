import { expect, test } from 'bun:test';
import { posix } from 'node:path';
import { build } from 'vite';
import { blokAssets } from './blok-assets';

test('Blok browser assets retain a complete, local ESM graph under the configured base', async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      blokAssets('_/app', '/wiki'),
      {
        name: 'test-entry',
        resolveId: (id) => id === 'test-entry' ? '\0test-entry' : undefined,
        load: (id) => id === '\0test-entry' ? `
          export { Blok } from '@bloklabs/core';
          export { Paragraph } from '@bloklabs/core/tools';
          export { markdownToBlocksWithReport } from '@bloklabs/core/markdown';
        ` : undefined
      }
    ],
    build: { write: false, rolldownOptions: { input: 'test-entry', preserveEntrySignatures: 'strict' } }
  });
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected a single build');
  const assets = new Map(result.output.filter((item) => item.type === 'asset').map((item) => [item.fileName, item]));
  const chunk = result.output.find((item) => item.type === 'chunk' && item.isEntry);
  expect(chunk?.type).toBe('chunk');
  if (chunk?.type !== 'chunk') return;
  expect(chunk.imports).toHaveLength(3);
  for (const id of chunk.imports) {
    expect(id).toMatch(/^\/wiki\/_\/app\/immutable\/vendor\/blok-[a-f0-9]{16}\//);
    expect(assets.has(id.slice('/wiki/'.length))).toBe(true);
  }
  const scanner = new Bun.Transpiler({ loader: 'js' });
  for (const [name, asset] of assets) {
    if (!name.endsWith('.mjs')) continue;
    const source = typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString();
    for (const dependency of scanner.scanImports(source)) {
      expect(dependency.path.startsWith('.')).toBe(true);
      expect(assets.has(posix.join(posix.dirname(name), dependency.path))).toBe(true);
    }
  }
  for (const name of ['LICENSE', 'NOTICE', 'vendor.LICENSE.txt']) {
    expect([...assets.keys()].some((file) => file.endsWith(`/${name}`))).toBe(true);
  }
});
