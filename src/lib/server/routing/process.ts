import type { DocumentationRequest } from '../../shared/request';
import { notImplemented, type ServiceResult } from '../../shared/result';
import { documentationService } from '../documentation';
import { markdownService, renderSource, type RenderedDocument } from '../markdown';
import { sourceLanguage } from '../../shared/highlighting';

/** Read-only execution; editor and directory-listing modes remain explicit stubs. */
export async function processDocumentationRequest(
  request: DocumentationRequest
): Promise<ServiceResult<RenderedDocument>> {
  if (request.mode !== 'view') return notImplemented(request.mode === 'files' ? 'Directory listing' : 'Editor');
  const resource = await documentationService.resolve(request.pathname, request.mode);
  if (resource.status !== 'ok') return resource;
  const source = await documentationService.read(resource.value.path);
  if (source.status !== 'ok') return source;
  if (resource.value.kind === 'source') return {
    status: 'ok', value: await renderSource(source.value.content, source.value.path, sourceLanguage(source.value.path))
  };
  return markdownService.render(source.value.content, source.value.path);
}

export type ServiceAction = 'login' | 'logout' | 'manage-users' | 'save-document' | 'publish';

/**
 * Side-effect-free action boundary. Future implementations must authenticate,
 * authorize, validate input and origin, then call the domain service. Deliberately
 * do not parse credentials/bodies or invoke domain mutations before that exists.
 */
export async function processServiceAction(action: ServiceAction): Promise<ServiceResult<never>> {
  return notImplemented(`Service action: ${action}`);
}
