import { resolve } from 'node:path';
import { writeNavigationCache } from '../src/lib/server/documentation/cache';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) {
  console.error('Usage: bun scan-docs.js [--output <navigation.yaml>]');
  process.exit(2);
}
const destination = args.length ? resolve(args[1]) : resolve(import.meta.dir, 'navigation.yaml');
try {
  const count = await writeNavigationCache(process.env.DOCS_DIR?.trim(), destination,
    (path, message) => console.warn(`${path}: ${message}`));
  console.log(`Cached ${count} entries in ${destination}. Reload the page to refresh navigation.`);
} catch (cause) {
  console.error('Navigation scan failed:', cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
}
