import { error, redirect } from '@sveltejs/kit';
import { getAuthService } from '$lib/server/auth/runtime';
import { requireOrigin, SESSION_COOKIE } from '$lib/server/auth/http';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async (event) => {
  requireOrigin(event);
  const result = await getAuthService().logout(event.cookies.get(SESSION_COOKIE));
  if (result.status !== 'ok') error(503, 'Authentication unavailable');
  event.cookies.delete(SESSION_COOKIE, { path: '/' });
  event.locals.session = null;
  redirect(303, '/');
};
