import type { Session } from './lib/server/auth';
import type { WikiRequest } from './lib/shared/request';

declare global {
  namespace App {
    interface Locals {
      wikiRequest: WikiRequest;
      session: Session | null;
      authUnavailable: boolean;
    }
  }
}

export {};
