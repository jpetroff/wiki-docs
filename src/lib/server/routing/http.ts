import { error, fail, json } from '@sveltejs/kit';
import type { ServiceResult } from '../../shared/result';
import { processServiceAction, type ServiceAction } from './process';

export async function documentationResponse<T>(operation: () => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> {
  let result: ServiceResult<T>;
  try { result = await operation(); }
  catch (cause) {
    console.error('Documentation request failed', cause);
    error(500, 'Unable to load documentation');
  }
  if (result.status === 'not-found') error(404, 'Page not found');
  if (result.status === 'unavailable') error(503, 'Documentation unavailable');
  return result;
}

export async function stubMutationResponse(action: ServiceAction) {
  return json(await processServiceAction(action), {
    status: 501,
    headers: { 'cache-control': 'no-store' }
  });
}

export async function stubFormAction(action: ServiceAction) {
  return fail(501, await processServiceAction(action));
}
