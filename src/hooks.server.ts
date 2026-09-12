import type { Handle } from '@sveltejs/kit';
import { classifyRequest } from '$lib/server/routing/classify';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.wikiRequest = classifyRequest(event.url);
  return resolve(event);
};
