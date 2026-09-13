import { stubMutationResponse } from '$lib/server/routing/http';
import { requireOrigin, requirePermission } from '$lib/server/auth/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => {
  requireOrigin(event);
  requirePermission(event, 'edit', true);
  return stubMutationResponse('save-document');
};
export const PUT: RequestHandler = POST;
export const PATCH: RequestHandler = POST;
export const DELETE: RequestHandler = POST;
