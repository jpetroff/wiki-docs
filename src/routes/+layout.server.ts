import { getPublicConfig } from '$lib/server/config';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({ config: getPublicConfig(), user: locals.session?.user ?? null });

export const prerender = false;
export const ssr = true;
