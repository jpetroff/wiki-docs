import { notImplemented, type ServiceResult } from '../../shared/result';
import type { DocumentationMode } from '../../shared/request';
import { getServerConfig } from '../config';
import { createFileReader, type ResolvedFile } from './filesystem';

export type DocumentResource = ResolvedFile;
export interface DocumentSource { path: string; content: string; revision: string }
export interface DirectoryEntry { name: string; path: string; kind: 'file' | 'directory' }
export interface SaveDocumentInput { path: string; markdown: string; originalRevision: string }
export interface DocumentationService {
  resolve(pathname: string, mode: DocumentationMode): Promise<ServiceResult<DocumentResource>>;
  read(path: string): Promise<ServiceResult<DocumentSource>>;
  list(path: string): Promise<ServiceResult<DirectoryEntry[]>>;
  save(input: SaveDocumentInput): Promise<ServiceResult<{ revision: string }>>;
}
export const documentationFiles = createFileReader(() => getServerConfig().docsDir);
export const documentationService: DocumentationService = {
  async resolve(pathname, mode) {
    if (mode !== 'view') return notImplemented(mode === 'files' ? 'Directory listing' : 'Editor');
    return documentationFiles.resolve(pathname);
  },
  async read(path) {
    const bytes = await documentationFiles.read(path);
    if (bytes.status !== 'ok') return bytes;
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.value); }
    catch { return { status: 'not-found' }; }
    if (content.includes('\0')) return { status: 'not-found' };
    return { status: 'ok', value: {
      path, content, revision: new Bun.CryptoHasher('sha256').update(bytes.value).digest('hex')
    } };
  },
  async list() { return notImplemented('Directory listing'); },
  async save() { return notImplemented('Markdown file saving'); }
};
