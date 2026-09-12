/** Stable boundary for unfinished services; never mistake a stub for success. */
export type ServiceResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'not-implemented'; feature: string; message: string };

export function notImplemented(feature: string): ServiceResult<never> {
  return {
    status: 'not-implemented',
    feature,
    message: `${feature} is not implemented in this scaffold.`
  };
}
