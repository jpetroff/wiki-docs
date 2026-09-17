import { getPublicConfig } from '$lib/server/config';
import type { LayoutServerLoad } from './$types';
import { documentationService } from '$lib/server/documentation';
import { authorize } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ locals, url, depends }) => {
  depends('documentation:navigation');
  const showNavigation = !url.pathname.startsWith('/_/') || url.pathname === '/_/new';
  let navigation = null;
  if (showNavigation) {
    try {
      const result = await documentationService.list('', 1);
      if (result.status === 'ok') navigation = result.value;
    } catch (cause) { console.error('Navigation load failed', cause); }
  }
  return { config: getPublicConfig(), user: locals.session?.user ?? null, navigation,
    canCreate: !locals.authUnavailable && authorize('edit', locals.session).status === 'ok' };
};

export const prerender = false;
export const ssr = true;
