import { notImplemented, type ServiceResult } from '../../shared/result';

export interface PendingChange {
  path: string;
  revision: string;
}

export interface PublishInput {
  message: string;
  reviewedRevision: string;
}

export interface GitService {
  status(): Promise<ServiceResult<{ changes: PendingChange[]; revision: string }>>;
  publish(input: PublishInput): Promise<ServiceResult<{ commit: string }>>;
}

// Later discover the existing checkout and use host Git credentials. No subprocess
// calls, clone, branch changes, commits, or pushes belong in the scaffold.
export const gitService: GitService = {
  async status() { return notImplemented('Git status'); },
  async publish() { return notImplemented('Git publishing'); }
};
