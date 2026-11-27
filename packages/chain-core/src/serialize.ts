import type { Chain } from './types';

/** Raised when a chain file is not valid JSON or does not have the block shape. */
export class ChainParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainParseError';
  }
}

/** Human-readable JSON (2-space indentation + trailing newline), easy to edit by hand in the T08 demo. */
export function serializeChain(chain: Chain): string {
  return `${JSON.stringify(chain, null, 2)}\n`;
}

/**
 * Parses a chain file. Rejects malformed JSON or blocks missing the 5 fields,
 * but accepts tampered hashes: integrity is `validateChain`'s job.
 */
export function parseChain(text: string): Chain {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ChainParseError('O conteúdo da cadeia não é um JSON válido');
  }
  if (!Array.isArray(parsed)) {
    throw new ChainParseError('A cadeia deve ser um array de blocos');
  }
  parsed.forEach((block, position) => {
    const ok =
      typeof block === 'object' &&
      block !== null &&
      !Array.isArray(block) &&
      typeof block.index === 'number' &&
      typeof block.timestamp === 'string' &&
      typeof block.data === 'object' &&
      block.data !== null &&
      typeof block.previousHash === 'string' &&
      typeof block.hash === 'string';
    if (!ok) {
      throw new ChainParseError(
        `O bloco na posição ${position} não tem os campos index, timestamp, data, previousHash e hash`,
      );
    }
  });
  return parsed as Chain;
}
