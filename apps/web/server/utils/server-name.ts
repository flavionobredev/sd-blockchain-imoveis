import type { H3Event } from 'h3';

export const DEFAULT_SERVER_NAME = 'WEB-LOCAL';

/** Normalizes the instance name coming from runtimeConfig. */
export function resolveServerName(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_SERVER_NAME;
}

/** Name of the instance serving the request (read at runtime). */
export function getServerName(event: H3Event): string {
  return resolveServerName(useRuntimeConfig(event).serverName);
}
