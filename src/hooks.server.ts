import { type Handle } from '@sveltejs/kit';
import { classifyRequest } from '$lib/server/routing/classify';
import { getAuthService } from '$lib/server/auth/runtime';
import { SESSION_COOKIE } from '$lib/server/auth/http';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.wikiRequest = classifyRequest(event.url);
  event.locals.session = null;
  event.locals.authUnavailable = false;
  const token = event.cookies.get(SESSION_COOKIE);
  // Public asset requests never need account storage.
  if (token && !event.url.pathname.startsWith('/_/assets/') && !event.url.pathname.startsWith('/_/app/')) {
    const result = await getAuthService().lookupSession(token);
    if (result.status === 'ok') {
      event.locals.session = result.value;
      if (!result.value) event.cookies.delete(SESSION_COOKIE, { path: '/' });
    } else event.locals.authUnavailable = true;
  }
  const response = await resolve(event);
  if (!event.url.pathname.startsWith('/_/assets/') && !event.url.pathname.startsWith('/_/app/')) response.headers.set('cache-control', 'no-store');
  return response;
};
