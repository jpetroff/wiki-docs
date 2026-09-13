import { validateDatabasePath } from '../src/lib/server/database';
try {
  const deploymentDir = process.argv[2];
  if (!deploymentDir) throw new Error('Deployment directory is required.');
  validateDatabasePath({
    path: process.env.DATABASE_PATH?.trim() || './data/wiki.sqlite',
    docsDir: process.env.DOCS_DIR?.trim() || undefined,
    production: true,
    deploymentDir
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid database configuration.');
  process.exitCode = 1;
}
