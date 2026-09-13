import { processDocumentationRequest } from '$lib/server/routing/process';
import { documentationResponse } from '$lib/server/routing/http';
import { classifyRequest } from '$lib/server/routing/classify';
import type { PageServerLoad } from './$types';
import { requirePermission } from '$lib/server/auth/http';
import { error } from '@sveltejs/kit';

export const trailingSlash = 'ignore';
export const load: PageServerLoad = async (event) => {
  const { url, setHeaders } = event;
  // Read the tracked URL so SvelteKit reruns this loader for path/mode changes.
  const request = classifyRequest(url);
  if (request.kind !== 'documentation') error(404, 'Unknown service route');
  if (request.mode === 'edit') requirePermission(event, 'edit');
  setHeaders({ 'cache-control': 'no-store' });
  return { request, result: await documentationResponse(() => processDocumentationRequest(request)) };
};
