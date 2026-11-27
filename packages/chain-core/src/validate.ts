import { canonicalJson, calculateHash } from './hash';
import { createGenesisBlock } from './block';
import type { Block, Chain, ChainInvalidReason, ChainValidationResult } from './types';

const HEX_64 = /^[0-9a-f]{64}$/;
const ISO_UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * True only for ISO 8601 UTC timestamps with milliseconds (e.g. `2026-11-25T14:00:00.000Z`)
 * that denote a real date: the round trip through `Date` must return the same string,
 * which rejects dates without time, offsets other than `Z` and impossible dates (Feb 30).
 */
export function isIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_UTC_MILLIS.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks the shape of a non-genesis block and of its `data`. */
export function hasValidBlockFormat(block: unknown): boolean {
  if (!isRecord(block)) return false;
  const { index, timestamp, data, previousHash, hash } = block;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return false;
  if (!isIsoUtcTimestamp(timestamp)) return false;
  if (typeof previousHash !== 'string' || !HEX_64.test(previousHash)) return false;
  if (typeof hash !== 'string' || !HEX_64.test(hash)) return false;
  if (!isRecord(data)) return false;
  switch (data.operation) {
    case 'REGISTRATION':
      return isNonEmptyString(data.propertyId) && isNonEmptyString(data.address) && isNonEmptyString(data.owner);
    case 'TRANSFER':
      return (
        isNonEmptyString(data.propertyId) &&
        isNonEmptyString(data.address) &&
        isNonEmptyString(data.previousOwner) &&
        isNonEmptyString(data.newOwner)
      );
    default:
      // GENESIS is only allowed at index 0; unknown operations are invalid.
      return false;
  }
}

function invalid(invalidIndex: number, reason: ChainInvalidReason, message: string): ChainValidationResult {
  return { valid: false, invalidIndex, reason, message };
}

/**
 * Validates the chain from block 0 to the last one and stops at the first problem.
 * Check order: genesis → format → index → previousHash → hash.
 */
export function validateChain(chain: Chain): ChainValidationResult {
  if (!Array.isArray(chain) || chain.length === 0) {
    return invalid(0, 'INVALID_GENESIS', 'A cadeia está vazia: falta o bloco gênese');
  }
  if (canonicalJson(chain[0]) !== canonicalJson(createGenesisBlock())) {
    return invalid(0, 'INVALID_GENESIS', 'Bloco 0: o bloco gênese não corresponde ao canônico');
  }
  for (let i = 1; i < chain.length; i++) {
    const block = chain[i];
    if (!hasValidBlockFormat(block)) {
      return invalid(i, 'INVALID_DATA', `Bloco ${i}: formato do bloco ou dos dados é inválido`);
    }
    if (block.index !== i) {
      return invalid(i, 'INDEX_OUT_OF_SEQUENCE', `Bloco ${i}: index ${block.index} fora de sequência (esperado ${i})`);
    }
    if (block.previousHash !== chain[i - 1].hash) {
      return invalid(i, 'INVALID_PREVIOUS_HASH', `Bloco ${i}: previousHash não corresponde ao hash do bloco ${i - 1}`);
    }
    if (block.hash !== calculateHash(block)) {
      return invalid(i, 'INVALID_HASH', `Bloco ${i}: o hash armazenado não corresponde ao conteúdo`);
    }
  }
  return { valid: true, length: chain.length };
}
