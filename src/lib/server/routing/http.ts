import { fail, json } from '@sveltejs/kit';
import { processServiceAction, type ServiceAction } from './process';

export async function stubMutationResponse(action: ServiceAction) {
  return json(await processServiceAction(action), {
    status: 501,
    headers: { 'cache-control': 'no-store' }
  });
}

export async function stubFormAction(action: ServiceAction) {
  return fail(501, await processServiceAction(action));
}
