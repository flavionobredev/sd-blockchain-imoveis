import { createHash } from 'node:crypto';
import type { Block } from './types';

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace,
 * `undefined` properties omitted. Key order read from disk never changes the hash.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

/** SHA-256 (hex) over the canonical JSON of `{ index, timestamp, data, previousHash }`. */
export function calculateHash(block: Omit<Block, 'hash'>): string {
  const { index, timestamp, data, previousHash } = block;
  return createHash('sha256').update(canonicalJson({ index, timestamp, data, previousHash })).digest('hex');
}
