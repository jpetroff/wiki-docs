import { error, fail, redirect } from '@sveltejs/kit';
import { getAuthService } from '$lib/server/auth/runtime';
import { readLoginForm, requireOrigin, safeReturnTo, SESSION_COOKIE } from '$lib/server/auth/http';
import { SESSION_SECONDS } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.authUnavailable) error(503, 'Authentication unavailable');
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
  if (locals.session) redirect(303, returnTo);
  return { returnTo };
};
export const actions: Actions = {
  default: async (event) => {
    requireOrigin(event);
    const form = await readLoginForm(event.request);
    const login = form.get('login') ?? '';
    const password = form.get('password') ?? '';
    const returnTo = safeReturnTo(event.url.searchParams.get('returnTo'));
    if (form.getAll('login').length !== 1 || form.getAll('password').length !== 1) return fail(400, { login: '', message: 'Enter a username and password.' });
    const service = getAuthService();
    const result = await service.login(login, password);
    if (result.status === 'unavailable') error(503, 'Authentication unavailable');
    if (result.status === 'throttled') {
      event.setHeaders({ 'retry-after': String(result.retryAfter) });
      return fail(429, { login, message: `Too many login attempts. Try again in ${result.retryAfter} seconds.` });
    }
    if (result.status !== 'ok') return fail(400, { login, message: 'Invalid username or password.' });
    // A successful re-login replaces this browser's previous session.
    const previous = event.cookies.get(SESSION_COOKIE);
    if (previous) {
      const revoked = await service.logout(previous);
      if (revoked.status !== 'ok') {
        await service.logout(result.value.token);
        error(503, 'Authentication unavailable');
      }
    }
    event.cookies.set(SESSION_COOKIE, result.value.token, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: event.url.protocol === 'https:',
      maxAge: SESSION_SECONDS, expires: new Date(result.value.expiresAt)
    });
    event.locals.session = { user: result.value.user, expiresAt: result.value.expiresAt };
    redirect(303, returnTo);
  }
};
