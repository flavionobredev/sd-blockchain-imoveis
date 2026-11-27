import { calculateHash } from './hash';
import { deriveState } from './state';
import { hasValidBlockFormat, validateChain } from './validate';
import type {
  AppendBlockError,
  Block,
  Chain,
  ChainValidationResult,
  GapStatus,
  OperationError,
  Result,
} from './types';

/** Classifies an incoming block against the last local block. */
export function detectGap(chain: Chain, incoming: Block): GapStatus {
  const last = chain[chain.length - 1];
  if (!last) return 'GAP';
  if (incoming.index === last.index + 1) return 'NEXT';
  if (incoming.index > last.index + 1) return 'GAP';
  const local = chain.find((block) => block.index === incoming.index);
  return local && local.hash === incoming.hash ? 'ALREADY_EXISTS' : 'CONFLICT';
}

/** Appends `block` only if it is the next one, correctly chained and with a valid hash. Never mutates `chain`. */
export function appendBlock(chain: Chain, block: Block): Result<Chain, AppendBlockError> {
  const status = detectGap(chain, block);
  const last = chain[chain.length - 1];
  if (status !== 'NEXT') {
    const messages: Record<Exclude<GapStatus, 'NEXT'>, string> = {
      GAP: `Bloco ${block.index}: lacuna detectada (último bloco local é ${last ? last.index : 'nenhum'})`,
      ALREADY_EXISTS: `Bloco ${block.index}: já existe na cadeia local`,
      CONFLICT: `Bloco ${block.index}: conflita com o bloco local de mesmo índice`,
    };
    return { ok: false, error: { reason: status, message: messages[status] } };
  }
  if (!hasValidBlockFormat(block)) {
    return {
      ok: false,
      error: { reason: 'INVALID_DATA', message: `Bloco ${block.index}: formato do bloco ou dos dados é inválido` },
    };
  }
  if (block.previousHash !== last.hash) {
    return {
      ok: false,
      error: {
        reason: 'INVALID_PREVIOUS_HASH',
        message: `Bloco ${block.index}: previousHash não corresponde ao hash do bloco ${last.index}`,
      },
    };
  }
  if (block.hash !== calculateHash(block)) {
    return {
      ok: false,
      error: { reason: 'INVALID_HASH', message: `Bloco ${block.index}: o hash armazenado não corresponde ao conteúdo` },
    };
  }
  return { ok: true, value: [...chain, { ...block, data: { ...block.data } }] };
}

/**
 * Approves replacing the local chain with `remote` only if it passes `validateChain` and `deriveState`.
 * Lengths are not compared: the coordinator is the authority (decision D3).
 */
export function canReplaceChain(remote: Chain): Result<void, ChainValidationResult | OperationError> {
  const validation = validateChain(remote);
  if (!validation.valid) return { ok: false, error: validation };
  const state = deriveState(remote);
  if (!state.ok) return { ok: false, error: state.error };
  return { ok: true, value: undefined };
}
