import { stubFormAction } from '$lib/server/routing/http';
import { requireOrigin, requirePermission } from '$lib/server/auth/http';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = (event) => { requirePermission(event, 'manage-users'); return {}; };
export const actions: Actions = { default: (event) => {
  requireOrigin(event);
  requirePermission(event, 'manage-users', true);
  return stubFormAction('manage-users');
} };
