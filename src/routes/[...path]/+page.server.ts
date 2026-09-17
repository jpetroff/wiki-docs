import { processDocumentationRequest } from '$lib/server/routing/process';
import { documentationResponse } from '$lib/server/routing/http';
import { classifyRequest } from '$lib/server/routing/classify';
import type { PageServerLoad } from './$types';
import { requirePermission } from '$lib/server/auth/http';
import { error } from '@sveltejs/kit';
import { authorize } from '$lib/server/auth';
import { documentationService } from '$lib/server/documentation';
import { parentPath } from '$lib/shared/navigation';

export const trailingSlash = 'ignore';
export const load: PageServerLoad = async (event) => {
  const { url, setHeaders } = event;
  // Read the tracked URL so SvelteKit reruns this loader for path/mode changes.
  const request = classifyRequest(url);
  if (request.kind !== 'documentation') error(404, 'Unknown service route');
  if (request.mode === 'edit') requirePermission(event, 'edit');
  setHeaders({ 'cache-control': 'no-store' });
  const canEdit = !event.locals.authUnavailable && authorize('edit', event.locals.session).status === 'ok';
  if (request.mode === 'edit') {
    const resource = await documentationResponse(() => documentationService.resolve(request.pathname, 'edit'));
    if (resource.status !== 'ok') error(404, 'Page not found');
    const source = await documentationResponse(() => documentationService.read(resource.value.path));
    if (source.status !== 'ok') error(404, 'Page not found');
    return { request, canEdit, directory: null, result: null, edit: { ...source.value, kind: resource.value.kind } };
  }
  const folder = await documentationResponse<{ kind: 'directory'; path: string } | null>(() => documentationService.resolveDirectory(request.pathname).then((result) =>
    result.status === 'not-found' ? { status: 'ok' as const, value: null } : result));
  if (folder.status !== 'ok') error(404, 'Page not found');
  if (request.mode === 'files' || folder.value) {
    let path = folder.value?.path;
    if (path === undefined) {
      const resource = await documentationResponse(() => documentationService.resolve(request.pathname, 'view'));
      if (resource.status !== 'ok') error(404, 'Page not found');
      path = parentPath(resource.value.path);
    }
    const listing = await documentationResponse(() => documentationService.list(path));
    if (listing.status !== 'ok') error(404, 'Folder not found');
    if (request.mode === 'files' || !listing.value.hasIndex) {
      return { request, canEdit, edit: null, result: null, directory: listing.value };
    }
  }
  return { request, canEdit, directory: null, edit: null, result: await documentationResponse(() => processDocumentationRequest(request)) };
};
