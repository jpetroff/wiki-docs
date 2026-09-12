import { env } from '$env/dynamic/private';

export interface ServerConfig {
  docsDir: string | undefined;
  databasePath: string;
  siteTitle: string;
  origin: string | undefined;
  git: { remote: string | undefined; branch: string | undefined };
}

/** Read lazily so building and starting do not require a configured checkout. */
export function getServerConfig(): ServerConfig {
  return {
    docsDir: env.DOCS_DIR?.trim() || undefined,
    databasePath: env.DATABASE_PATH?.trim() || './data/wiki.sqlite',
    siteTitle: env.SITE_TITLE?.trim() || 'WikiDocs',
    origin: env.ORIGIN?.trim() || undefined,
    git: {
      remote: env.GIT_REMOTE?.trim() || undefined,
      branch: env.GIT_BRANCH?.trim() || undefined
    }
  };
}

/** Only this explicit projection may be returned to a browser. */
export function getPublicConfig() {
  const config = getServerConfig();
  return {
    siteTitle: config.siteTitle,
    documentationConfigured: Boolean(config.docsDir)
  };
}
