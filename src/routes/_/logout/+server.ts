import { stubMutationResponse } from '$lib/server/routing/http';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = () => stubMutationResponse('logout');
