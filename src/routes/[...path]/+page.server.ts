import { error } from '@sveltejs/kit';
import { processDocumentationRequest } from '$lib/server/routing/process';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const request = locals.wikiRequest;
  // Defense in depth: an unrecognized reserved route must never become a doc.
  if (request.kind !== 'documentation') error(404, 'Unknown service route');
  return { request, result: await processDocumentationRequest(request) };
};
