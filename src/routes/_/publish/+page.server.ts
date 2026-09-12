import { stubFormAction } from '$lib/server/routing/http';
import type { Actions } from './$types';

export const actions: Actions = { default: () => stubFormAction('publish') };
