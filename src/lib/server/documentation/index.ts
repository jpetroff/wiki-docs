import { notImplemented, type ServiceResult } from '../../shared/result';
import type { DocumentationMode } from '../../shared/request';

export type DocumentResource =
  | { kind: 'markdown'; path: string }
  | { kind: 'directory'; path: string }
  | { kind: 'asset'; path: string };

export interface DocumentSource {
  path: string;
  markdown: string;
  revision: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  kind: 'file' | 'directory';
}

export interface SaveDocumentInput {
  path: string;
  markdown: string;
  originalRevision: string;
}

export interface DocumentationService {
  resolve(pathname: string, mode: DocumentationMode): Promise<ServiceResult<DocumentResource>>;
  read(path: string): Promise<ServiceResult<DocumentSource>>;
  list(path: string): Promise<ServiceResult<DirectoryEntry[]>>;
  save(input: SaveDocumentInput): Promise<ServiceResult<{ revision: string }>>;
}

// Future resolver owns root containment, decoding, symlinks, folder/README lookup,
// files-mode parent lookup, and 404s. Never use a URL pathname directly as a path.
export const documentationService: DocumentationService = {
  async resolve() { return notImplemented('Documentation resource resolution'); },
  async read() { return notImplemented('Markdown file reading'); },
  async list() { return notImplemented('Directory listing'); },
  async save() { return notImplemented('Markdown file saving'); }
};
