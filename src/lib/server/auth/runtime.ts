import { dev } from '$app/environment';
import { getServerConfig } from '../config';
import { createAuthService, type AuthService } from './index';
let service: AuthService | undefined;
export function getAuthService(): AuthService {
  if (!service) {
    const config = getServerConfig();
    service = createAuthService({ path: config.databasePath, docsDir: config.docsDir, production: !dev });
  }
  return service;
}
