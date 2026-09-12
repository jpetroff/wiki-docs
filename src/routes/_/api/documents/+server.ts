import { stubMutationResponse } from '$lib/server/routing/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => stubMutationResponse('save-document');
export const PUT: RequestHandler = POST;
export const PATCH: RequestHandler = POST;
export const DELETE: RequestHandler = POST;
