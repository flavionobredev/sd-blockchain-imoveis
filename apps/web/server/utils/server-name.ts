import type { H3Event } from 'h3';

export const DEFAULT_SERVER_NAME = 'WEB-LOCAL';

/** Normaliza o nome da instância vindo do runtimeConfig. */
export function resolveServerName(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_SERVER_NAME;
}

/** Nome da instância que está atendendo a requisição (lido em runtime). */
export function getServerName(event: H3Event): string {
  return resolveServerName(useRuntimeConfig(event).serverName);
}
