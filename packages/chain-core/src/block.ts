import { calculateHash } from './hash';
import type { Block, BlockData } from './types';

export const GENESIS_TIMESTAMP = '2026-01-01T00:00:00.000Z';
export const GENESIS_PREVIOUS_HASH = '0'.repeat(64);

function buildGenesisBlock(): Block {
  const base = {
    index: 0,
    timestamp: GENESIS_TIMESTAMP,
    data: { operation: 'GENESIS' } as const,
    previousHash: GENESIS_PREVIOUS_HASH,
  };
  return { ...base, hash: calculateHash(base) };
}

/** Hash of the canonical genesis block (identical on every node). */
export const GENESIS_HASH: string = buildGenesisBlock().hash;

/** Returns a fresh copy of the deterministic genesis block. */
export function createGenesisBlock(): Block {
  return buildGenesisBlock();
}

/** Builds the block that follows `previous`. `timestamp` defaults to the current clock (ISO UTC). */
export function createBlock(previous: Block, data: BlockData, timestamp: string = new Date().toISOString()): Block {
  const base = {
    index: previous.index + 1,
    timestamp,
    data: { ...data },
    previousHash: previous.hash,
  };
  return { ...base, hash: calculateHash(base) };
}
