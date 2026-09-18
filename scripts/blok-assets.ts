import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Ship Blok's prebuilt ESM graph without rebuilding its optional renderers. */
export function blokAssets(appDir = '_app', assetBase = ''): Plugin {
  const entry = Bun.resolveSync('@bloklabs/core', import.meta.dir);
  const root = dirname(entry);
  let files: { name: string; source: Buffer }[];
  let directory: string;

  return {
    name: 'blok-assets',
    apply: 'build',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'client',
    buildStart() {
      files = readdirSync(root, { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith('.mjs') || name === 'vendor.LICENSE.txt')
        .sort()
        .map((name) => ({ name, source: readFileSync(resolve(root, name)) }));
      for (const name of ['LICENSE', 'NOTICE']) {
        files.push({ name, source: readFileSync(resolve(root, '..', name)) });
      }
      const hash = createHash('sha256');
      for (const { name, source } of files) {
        hash.update(name).update('\0').update(source).update('\0');
      }
      directory = `${appDir}/immutable/vendor/blok-${hash.digest('hex').slice(0, 16)}`;
    },
    resolveId(id) {
      if (!['@bloklabs/core', '@bloklabs/core/tools', '@bloklabs/core/markdown'].includes(id)) return;
      const name = relative(root, Bun.resolveSync(id, root));
      return { id: `${assetBase}/${directory}/${name}`, external: 'absolute' };
    },
    generateBundle() {
      for (const { name, source } of files) {
        this.emitFile({ type: 'asset', fileName: `${directory}/${name}`, source });
      }
    }
  };
}
