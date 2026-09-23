import { dev } from '$app/environment';
import { dirname, resolve } from 'node:path';
import { createNavigationCache } from './cache';
import type { ServiceResult } from '../../shared/result';
import type { DocumentationMode } from '../../shared/request';
import { getServerConfig } from '../config';
import { createFileReader, revisionOf, type ResolvedFile, type SaveResult } from './filesystem';
import type { DirectoryNode } from '../../shared/navigation';

export type DocumentResource = ResolvedFile;
export interface DocumentSource { path: string; content: string; revision: string }
export interface SaveDocumentInput { path: string; content: string; originalRevision: string }
export interface DocumentationService {
  resolve(pathname: string, mode: DocumentationMode): Promise<ServiceResult<DocumentResource>>;
  read(path: string): Promise<ServiceResult<DocumentSource>>;
  resolveDirectory: ReturnType<typeof createFileReader>['resolveDirectory'];
  list(path: string, depth?: number): Promise<ServiceResult<DirectoryNode>>;
  createFolder: ReturnType<typeof createFileReader>['createFolder'];
  createDocument: ReturnType<typeof createFileReader>['createDocument'];
  save(input: SaveDocumentInput): Promise<SaveResult>;
}
export const documentationFiles = createFileReader(() => getServerConfig().docsDir);
export const navigationCache = createNavigationCache(() => getServerConfig().docsDir,
  () => resolve(dev ? 'build' : dirname(resolve(process.argv[1])), 'navigation.yaml'));
export const documentationService: DocumentationService = {
  async resolve(pathname) {
    return documentationFiles.resolve(pathname);
  },
  async read(path) {
    const bytes = await documentationFiles.read(path);
    if (bytes.status !== 'ok') return bytes;
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.value); }
    catch { return { status: 'not-found' }; }
    if (content.includes('\0')) return { status: 'not-found' };
    return { status: 'ok', value: {
      path, content, revision: revisionOf(bytes.value)
    } };
  },
  resolveDirectory: documentationFiles.resolveDirectory,
  list: navigationCache.list,
  createFolder: documentationFiles.createFolder,
  createDocument: documentationFiles.createDocument,
  async save(input) { return documentationFiles.save(input.path, input.content, input.originalRevision); }
};
