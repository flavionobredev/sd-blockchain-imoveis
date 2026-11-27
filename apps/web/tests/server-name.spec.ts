import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_NAME, resolveServerName } from '../server/utils/server-name';

describe('resolveServerName', () => {
  it('uses the runtimeConfig value (NUXT_SERVER_NAME)', () => {
    expect(resolveServerName('WEB-01')).toBe('WEB-01');
  });

  it('falls back to the default when there is no value', () => {
    expect(resolveServerName(undefined)).toBe(DEFAULT_SERVER_NAME);
    expect(resolveServerName('  ')).toBe(DEFAULT_SERVER_NAME);
  });
});
