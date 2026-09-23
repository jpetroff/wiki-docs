import { getPublicConfig } from '$lib/server/config';
import type { LayoutServerLoad } from './$types';
import { navigationCache } from '$lib/server/documentation';
import { authorize } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ locals }) => {
  const result = await navigationCache.tree();
  const navigation = result.status === 'ok' ? result.value : null;
  return { config: getPublicConfig(), user: locals.session?.user ?? null, navigation,
    canCreate: !locals.authUnavailable && authorize('edit', locals.session).status === 'ok' };
};

export const prerender = false;
export const ssr = true;
