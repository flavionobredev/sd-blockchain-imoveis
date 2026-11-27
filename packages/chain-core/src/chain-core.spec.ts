import { describe, expect, it } from 'vitest';
import {
  GENESIS_HASH,
  GENESIS_PREVIOUS_HASH,
  ChainParseError,
  appendBlock,
  calculateHash,
  canReplaceChain,
  createBlock,
  createGenesisBlock,
  deriveState,
  detectGap,
  isIsoUtcTimestamp,
  parseChain,
  proposeBlock,
  serializeChain,
  validateChain,
  type Block,
  type Chain,
  type NewOperation,
  type TransferData,
} from './index';

const T1 = '2026-11-25T14:00:00.000Z';
const T2 = '2026-11-25T15:00:00.000Z';
const T3 = '2026-11-25T16:00:00.000Z';
const T4 = '2026-11-25T17:00:00.000Z';

function propose(chain: Chain, op: NewOperation, timestamp: string): Chain {
  const result = proposeBlock(chain, op, timestamp);
  if (!result.ok) throw new Error(result.error.message);
  return [...chain, result.value];
}

/** Genesis + IMV001 registered by Maria + transfers Maria → João → Ana. */
function buildSampleChain(): Chain {
  let chain: Chain = [createGenesisBlock()];
  chain = propose(chain, { operation: 'REGISTRATION', propertyId: 'IMV001', address: 'Rua A, 100', owner: 'Maria Silva' }, T1);
  chain = propose(chain, { operation: 'TRANSFER', propertyId: 'IMV001', newOwner: 'João Souza' }, T2);
  chain = propose(chain, { operation: 'TRANSFER', propertyId: 'IMV001', newOwner: 'Ana Lima' }, T3);
  return chain;
}

/** Rebuilds a block with a recalculated hash (simulates someone "fixing" a tampered block). */
function rehash(block: Omit<Block, 'hash'>): Block {
  return { ...block, hash: calculateHash(block) };
}

describe('hash and genesis', () => {
  it('produces the same hash regardless of key order', () => {
    const a = { index: 1, timestamp: T1, data: { operation: 'REGISTRATION', propertyId: 'IMV001', address: 'Rua A, 100', owner: 'Maria Silva' }, previousHash: GENESIS_HASH } as const;
    const b = { previousHash: GENESIS_HASH, data: { owner: 'Maria Silva', address: 'Rua A, 100', propertyId: 'IMV001', operation: 'REGISTRATION' }, timestamp: T1, index: 1 } as const;
    expect(calculateHash(a)).toBe(calculateHash(b));
    expect(calculateHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('builds a deterministic genesis and chains new blocks to the previous one', () => {
    const genesis = createGenesisBlock();
    expect(genesis).toEqual(createGenesisBlock());
    expect(genesis).toMatchObject({ index: 0, data: { operation: 'GENESIS' }, previousHash: GENESIS_PREVIOUS_HASH, hash: GENESIS_HASH });

    const block = createBlock(genesis, { operation: 'REGISTRATION', propertyId: 'IMV001', address: 'Rua A, 100', owner: 'Maria Silva' }, T1);
    expect(block.index).toBe(1);
    expect(block.previousHash).toBe(GENESIS_HASH);
    expect(block.hash).toBe(calculateHash(block));
  });
});

describe('business rules (RF01, RF03)', () => {
  it('registers a property as block 1 with normalized fields (T01)', () => {
    const chain = [createGenesisBlock()];
    const result = proposeBlock(chain, { operation: 'REGISTRATION', propertyId: '  imv001 ', address: ' Rua A, 100 ', owner: ' Maria Silva ' }, T1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      index: 1,
      timestamp: T1,
      previousHash: GENESIS_HASH,
      data: { operation: 'REGISTRATION', propertyId: 'IMV001', address: 'Rua A, 100', owner: 'Maria Silva' },
    });
    expect(validateChain([...chain, result.value])).toEqual({ valid: true, length: 2 });
  });

  it('rejects the three business rules and invalid data with stable codes, creating no block', () => {
    const chain = buildSampleChain();
    const cases: Array<[NewOperation, string]> = [
      [{ operation: 'REGISTRATION', propertyId: 'imv001', address: 'Rua B, 200', owner: 'Pedro' }, 'DUPLICATE_PROPERTY'],
      [{ operation: 'TRANSFER', propertyId: 'IMV999', newOwner: 'Pedro' }, 'PROPERTY_NOT_FOUND'],
      [{ operation: 'TRANSFER', propertyId: 'IMV001', newOwner: ' Ana Lima ' }, 'SAME_OWNER'],
      [{ operation: 'REGISTRATION', propertyId: 'IMV002', address: '   ', owner: 'Pedro' }, 'INVALID_DATA'],
      [{ operation: 'REGISTRATION', propertyId: 'X'.repeat(41), address: 'Rua C', owner: 'Pedro' }, 'INVALID_DATA'],
    ];
    for (const [op, code] of cases) {
      const result = proposeBlock(chain, op, T4);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(code);
        expect(result.error.message.length).toBeGreaterThan(0);
      }
    }
    // SAME_OWNER is case-sensitive (D2): a different casing is a different owner.
    expect(proposeBlock(chain, { operation: 'TRANSFER', propertyId: 'IMV001', newOwner: 'ana lima' }, T4).ok).toBe(true);
  });

  it('repeats the registered address on transfers and rejects a diverging address on replay (D1)', () => {
    const chain = buildSampleChain();
    expect(chain[2].data).toEqual({
      operation: 'TRANSFER',
      propertyId: 'IMV001',
      address: 'Rua A, 100',
      previousOwner: 'Maria Silva',
      newOwner: 'João Souza',
    });

    const tampered = rehash({ ...chain[2], data: { ...chain[2].data, address: 'Rua Z, 999' } as TransferData });
    const result = deriveState([chain[0], chain[1], tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'INVALID_DATA', blockIndex: 2 });
  });
});

describe('derived state (RF02, RF04)', () => {
  it('derives the current owner and the ordered history from the chain (T02)', () => {
    expect(deriveState([createGenesisBlock()])).toEqual({ ok: true, value: { properties: [] } });

    const result = deriveState(buildSampleChain());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [property] = result.value.properties;
    expect(property).toMatchObject({ propertyId: 'IMV001', address: 'Rua A, 100', currentOwner: 'Ana Lima', registeredAt: T1 });
    expect(property.history).toEqual([
      { owner: 'Maria Silva', since: T1, blockIndex: 1, operation: 'REGISTRATION' },
      { owner: 'João Souza', since: T2, blockIndex: 2, operation: 'TRANSFER' },
      { owner: 'Ana Lima', since: T3, blockIndex: 3, operation: 'TRANSFER' },
    ]);
  });
});

describe('integrity (RF06, T08)', () => {
  it('accepts an intact chain and pinpoints the tampered block and the reason', () => {
    const chain = buildSampleChain();
    expect(validateChain(chain)).toEqual({ valid: true, length: 4 });

    const editedOwner: Chain = structuredClone(chain);
    (editedOwner[1].data as { owner: string }).owner = 'Fraudador';
    expect(validateChain(editedOwner)).toMatchObject({ valid: false, invalidIndex: 1, reason: 'INVALID_HASH' });

    // Recalculating only the tampered hash breaks the link with the next block.
    const rehashed = [...editedOwner];
    rehashed[1] = rehash(editedOwner[1]);
    expect(validateChain(rehashed)).toMatchObject({ valid: false, invalidIndex: 2, reason: 'INVALID_PREVIOUS_HASH' });

    const outOfSequence = [...chain];
    outOfSequence[2] = { ...chain[2], index: 5 };
    expect(validateChain(outOfSequence)).toMatchObject({ invalidIndex: 2, reason: 'INDEX_OUT_OF_SEQUENCE' });

    const otherGenesis = [{ ...chain[0], timestamp: T1 }, ...chain.slice(1)];
    expect(validateChain(otherGenesis)).toMatchObject({ invalidIndex: 0, reason: 'INVALID_GENESIS' });
    expect(validateChain([])).toMatchObject({ invalidIndex: 0, reason: 'INVALID_GENESIS' });

    const unknownOperation = [...chain];
    unknownOperation[3] = { ...chain[3], data: { operation: 'DELETE' } as never };
    const invalid = validateChain(unknownOperation);
    expect(invalid).toMatchObject({ invalidIndex: 3, reason: 'INVALID_DATA' });
    if (!invalid.valid) expect(invalid.message).toContain('Bloco 3');
  });
});

describe('timestamp format (FR-001-C)', () => {
  it('accepts only real ISO 8601 UTC timestamps with milliseconds', () => {
    expect(isIsoUtcTimestamp(T1)).toBe(true);
    for (const value of ['2026-11-27', '2026-11-27T12:00:00-03:00', '2026-11-27T12:00:00Z', '2026-02-30T12:00:00.000Z', '2026-11-27T25:00:00.000Z', 'not a date', 1764252000000]) {
      expect(isIsoUtcTimestamp(value)).toBe(false);
    }

    const chain = buildSampleChain();
    for (const timestamp of ['2026-11-27', '2026-11-27T12:00:00-03:00', '2026-02-30T12:00:00.000Z']) {
      const tampered = [...chain];
      tampered[2] = rehash({ ...chain[2], timestamp });
      expect(validateChain(tampered)).toMatchObject({ valid: false, invalidIndex: 2, reason: 'INVALID_DATA' });

      const result = proposeBlock(chain, { operation: 'REGISTRATION', propertyId: 'IMV002', address: 'Rua B, 200', owner: 'Pedro' }, timestamp);
      expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_DATA' } });
    }
  });
});

describe('persistence (RD07, T09)', () => {
  it('round-trips through JSON and rejects malformed content', () => {
    const chain = buildSampleChain();
    const text = serializeChain(chain);
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  {');
    const parsed = parseChain(text);
    expect(parsed).toEqual(chain);
    expect(validateChain(parsed).valid).toBe(true);

    expect(() => parseChain('{ not json')).toThrow(ChainParseError);
    expect(() => parseChain('{"index":0}')).toThrow(ChainParseError);
    expect(() => parseChain('[{"index":0}]')).toThrow(ChainParseError);

    // A tampered hash still parses: integrity is validateChain's job.
    const tampered = text.replace(chain[2].hash, 'f'.repeat(64));
    expect(validateChain(parseChain(tampered))).toMatchObject({ invalidIndex: 2, reason: 'INVALID_HASH' });
  });
});

describe('recovery (RD04, RD06, T05, T07)', () => {
  it('classifies incoming blocks and appends only the next valid one', () => {
    const full = buildSampleChain();
    const local = full.slice(0, 3); // up to index 2
    const block3 = full[3];

    expect(detectGap(local, block3)).toBe('NEXT');
    expect(detectGap(local, { ...block3, index: 4 })).toBe('GAP');
    expect(detectGap(full, block3)).toBe('ALREADY_EXISTS');
    expect(detectGap(full, { ...block3, hash: 'a'.repeat(64) })).toBe('CONFLICT');

    const appended = appendBlock(local, block3);
    expect(appended.ok).toBe(true);
    if (appended.ok) expect(appended.value).toEqual(full);

    const wrongLink = rehash({ ...block3, previousHash: 'b'.repeat(64) });
    expect(appendBlock(local, wrongLink)).toMatchObject({ ok: false, error: { reason: 'INVALID_PREVIOUS_HASH' } });
    expect(appendBlock(local, { ...block3, hash: 'c'.repeat(64) })).toMatchObject({ ok: false, error: { reason: 'INVALID_HASH' } });
    expect(appendBlock(local, { ...block3, index: 4 })).toMatchObject({ ok: false, error: { reason: 'GAP' } });
  });

  it('validates a remote chain before replacement, regardless of its length (D3)', () => {
    const remote = buildSampleChain();
    expect(canReplaceChain(remote)).toEqual({ ok: true, value: undefined });
    expect(canReplaceChain(remote.slice(0, 2))).toEqual({ ok: true, value: undefined });

    const tampered: Chain = structuredClone(remote);
    (tampered[2].data as { newOwner: string }).newOwner = 'Fraudador';
    expect(canReplaceChain(tampered)).toMatchObject({ ok: false, error: { valid: false, invalidIndex: 2, reason: 'INVALID_HASH' } });

    // Structurally valid but absurd: transfer of a property that was never registered.
    const genesis = createGenesisBlock();
    const absurd = [genesis, createBlock(genesis, { operation: 'TRANSFER', propertyId: 'IMV777', address: 'Rua X', previousOwner: 'A', newOwner: 'B' }, T1)];
    expect(validateChain(absurd).valid).toBe(true);
    expect(canReplaceChain(absurd)).toMatchObject({ ok: false, error: { code: 'PROPERTY_NOT_FOUND', blockIndex: 1 } });
  });
});

describe('immutability', () => {
  it('never mutates the arrays and objects it receives', () => {
    const chain = buildSampleChain();
    const snapshot = structuredClone(chain);
    const next = proposeBlock(chain, { operation: 'REGISTRATION', propertyId: 'IMV002', address: 'Rua B, 200', owner: 'Pedro' }, T4);
    deriveState(chain);
    validateChain(chain);
    canReplaceChain(chain);
    serializeChain(chain);
    if (next.ok) {
      const appended = appendBlock(chain, next.value);
      expect(appended.ok && appended.value).not.toBe(chain);
    }
    expect(chain).toEqual(snapshot);
    expect(chain).toHaveLength(4);
  });
});
