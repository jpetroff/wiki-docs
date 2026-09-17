import { processDocumentationRequest } from '$lib/server/routing/process';
import { documentationResponse } from '$lib/server/routing/http';
import { classifyRequest } from '$lib/server/routing/classify';
import type { PageServerLoad } from './$types';
import { requirePermission } from '$lib/server/auth/http';
import { error } from '@sveltejs/kit';
import { authorize } from '$lib/server/auth';
import { documentationService } from '$lib/server/documentation';

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
    return { request, canEdit, result: null, edit: { ...source.value, kind: resource.value.kind } };
  }
  return { request, canEdit, edit: null, result: await documentationResponse(() => processDocumentationRequest(request)) };
};
