import { resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const output = resolve(process.env.WIKI_BUILD_OUT || 'build');
const cachePath = resolve(output, 'navigation.yaml');
const previousCache = await readFile(cachePath).catch((cause) => {
  if (cause.code !== 'ENOENT') throw cause;
  return undefined;
});
try {
  const build = Bun.spawn(['bun', '--bun', 'vite', 'build'], {
    stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, RAYON_NUM_THREADS: '2' }
  });
  const code = await build.exited;
  if (code) process.exitCode = code;
  else {
    const scanner = await Bun.build({ entrypoints: ['scripts/scan-docs.ts'], target: 'bun', outdir: output });
    if (!scanner.success) throw new AggregateError(scanner.logs, 'Scanner bundle failed');
    for (const name of ['.env', '.env.local', '.env.production']) {
      const content = await readFile(name).catch((cause) => {
        if (cause.code !== 'ENOENT') throw cause;
        return undefined;
      });
      if (content !== undefined) await writeFile(resolve(output, name), content, { mode: 0o600 });
    }
  }
} finally {
  if (previousCache && !await Bun.file(cachePath).exists()) {
    await mkdir(output, { recursive: true });
    await writeFile(cachePath, previousCache, { flag: 'wx', mode: 0o600 });
  }
}
