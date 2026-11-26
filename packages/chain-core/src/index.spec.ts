import { describe, expect, it } from 'vitest';
import { chainCoreHello } from './index';

describe('chain-core', () => {
  it('expõe placeholder', () => {
    expect(chainCoreHello()).toBe('chain-core:hello');
  });
});