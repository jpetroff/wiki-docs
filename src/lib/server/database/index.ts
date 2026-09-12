import { notImplemented, type ServiceResult } from '../../shared/result';

export interface DatabaseService {
  initialize(path: string): Promise<ServiceResult<void>>;
}

// Import bun:sqlite and apply migrations only in the accounts implementation pass.
// No initialization on module import, server startup, or requests in this pass.
export const databaseService: DatabaseService = {
  async initialize() { return notImplemented('SQLite initialization'); }
};
