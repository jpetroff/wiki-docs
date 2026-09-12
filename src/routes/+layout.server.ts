import { getPublicConfig } from '$lib/server/config';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({ config: getPublicConfig() });

export const prerender = false;
export const ssr = true;
