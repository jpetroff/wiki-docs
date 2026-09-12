import type { WikiRequest } from './lib/shared/request';

declare global {
  namespace App {
    interface Locals {
      wikiRequest: WikiRequest;
    }
  }
}

export {};
