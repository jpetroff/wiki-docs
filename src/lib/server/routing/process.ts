import type { DocumentationRequest } from '../../shared/request';
import { notImplemented, type ServiceResult } from '../../shared/result';
import { authService } from '../auth';
import { documentationService, type DocumentResource } from '../documentation';
import { markdownService } from '../markdown';

/** Execution remains separate from resource resolution and authorization. */
async function executeDocument(resource: DocumentResource, request: DocumentationRequest): Promise<ServiceResult<unknown>> {
  if (resource.kind === 'directory') return documentationService.list(resource.path);
  if (resource.kind === 'asset') return notImplemented('Asset serving');

  const source = await documentationService.read(resource.path);
  if (source.status !== 'ok') return source;
  if (request.mode === 'edit') return source;
  return markdownService.render(source.value.markdown, source.value.path);
}

export async function processDocumentationRequest(
  request: DocumentationRequest,
  sessionToken?: string
): Promise<ServiceResult<unknown>> {
  if (request.mode === 'edit') {
    const session = await authService.lookupSession(sessionToken);
    if (session.status !== 'ok') return session;
    const permission = await authService.authorize('edit', session.value);
    if (permission.status !== 'ok') return permission;
  }

  const resource = await documentationService.resolve(request.pathname, request.mode);
  if (resource.status !== 'ok') return resource;
  return executeDocument(resource.value, request);
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
