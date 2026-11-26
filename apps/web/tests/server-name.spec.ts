import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_NAME, resolveServerName } from '../server/utils/server-name';

describe('resolveServerName', () => {
  it('usa o valor do runtimeConfig (NUXT_SERVER_NAME)', () => {
    expect(resolveServerName('WEB-01')).toBe('WEB-01');
  });

  it('cai no padrão quando não há valor', () => {
    expect(resolveServerName(undefined)).toBe(DEFAULT_SERVER_NAME);
    expect(resolveServerName('  ')).toBe(DEFAULT_SERVER_NAME);
  });
});
