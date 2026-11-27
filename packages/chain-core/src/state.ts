import { createBlock } from './block';
import { isIsoUtcTimestamp } from './validate';
import type {
  Block,
  Chain,
  ChainState,
  NewOperation,
  OperationError,
  OperationErrorCode,
  Property,
  RegistrationData,
  Result,
  TransferData,
} from './types';

export const MAX_PROPERTY_ID_LENGTH = 40;

function fail<T>(code: OperationErrorCode, message: string): Result<T, OperationError> {
  return { ok: false, error: { code, message } };
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** `propertyId` normalization (decision D2): trim + upper case. */
export function normalizePropertyId(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Finds a property by id (comparison uses the normalized id). */
export function findProperty(state: ChainState, propertyId: string): Property | undefined {
  const id = normalizePropertyId(propertyId);
  return state.properties.find((property) => normalizePropertyId(property.propertyId) === id);
}

/** Checks the business rules of a registration or transfer against the current state. */
export function validateOperation(
  state: ChainState,
  data: RegistrationData | TransferData,
): Result<void, OperationError> {
  if (!data || (data.operation !== 'REGISTRATION' && data.operation !== 'TRANSFER')) {
    return fail('INVALID_DATA', 'Operação desconhecida');
  }
  if (!isFilled(data.propertyId)) {
    return fail('INVALID_DATA', 'O identificador do imóvel é obrigatório');
  }
  if (data.propertyId.trim().length > MAX_PROPERTY_ID_LENGTH) {
    return fail('INVALID_DATA', `O identificador do imóvel deve ter no máximo ${MAX_PROPERTY_ID_LENGTH} caracteres`);
  }
  if (!isFilled(data.address)) {
    return fail('INVALID_DATA', 'O endereço do imóvel é obrigatório');
  }

  const existing = findProperty(state, data.propertyId);

  if (data.operation === 'REGISTRATION') {
    if (!isFilled(data.owner)) {
      return fail('INVALID_DATA', 'O nome do proprietário é obrigatório');
    }
    if (existing) {
      return fail('DUPLICATE_PROPERTY', `O imóvel ${existing.propertyId} já está cadastrado`);
    }
    return { ok: true, value: undefined };
  }

  if (!isFilled(data.newOwner)) {
    return fail('INVALID_DATA', 'O nome do novo proprietário é obrigatório');
  }
  if (!existing) {
    return fail('PROPERTY_NOT_FOUND', `O imóvel ${data.propertyId.trim()} não está cadastrado`);
  }
  if (data.address !== existing.address) {
    return fail('INVALID_DATA', `O endereço da transferência não corresponde ao cadastro do imóvel ${existing.propertyId}`);
  }
  if (data.newOwner === existing.currentOwner) {
    return fail('SAME_OWNER', `${existing.currentOwner} já é o proprietário atual do imóvel ${existing.propertyId}`);
  }
  if (data.previousOwner !== existing.currentOwner) {
    return fail('INVALID_DATA', `O proprietário anterior não corresponde ao dono atual do imóvel ${existing.propertyId}`);
  }
  return { ok: true, value: undefined };
}

/**
 * Replays the chain in order and returns every property with its current owner and history.
 * The first block that breaks a business rule yields an error with its `blockIndex`.
 */
export function deriveState(chain: Chain): Result<ChainState, OperationError> {
  const properties: Property[] = [];
  const state: ChainState = { properties };

  for (let i = 1; i < chain.length; i++) {
    const block = chain[i];
    const blockIndex = typeof block?.index === 'number' ? block.index : i;
    const data = block?.data;

    if (!data || (data.operation !== 'REGISTRATION' && data.operation !== 'TRANSFER')) {
      return {
        ok: false,
        error: { code: 'INVALID_DATA', message: `Bloco ${blockIndex}: operação inválida`, blockIndex },
      };
    }

    const check = validateOperation(state, data);
    if (!check.ok) {
      return {
        ok: false,
        error: { ...check.error, message: `Bloco ${blockIndex}: ${check.error.message}`, blockIndex },
      };
    }

    if (data.operation === 'REGISTRATION') {
      properties.push({
        propertyId: data.propertyId,
        address: data.address,
        currentOwner: data.owner,
        registeredAt: block.timestamp,
        history: [{ owner: data.owner, since: block.timestamp, blockIndex, operation: 'REGISTRATION' }],
      });
    } else {
      const position = properties.findIndex(
        (property) => normalizePropertyId(property.propertyId) === normalizePropertyId(data.propertyId),
      );
      const current = properties[position];
      properties[position] = {
        ...current,
        currentOwner: data.newOwner,
        history: [
          ...current.history,
          { owner: data.newOwner, since: block.timestamp, blockIndex, operation: 'TRANSFER' },
        ],
      };
    }
  }

  return { ok: true, value: state };
}

/**
 * Validates a write request against the chain and returns the next block, ready to persist.
 * For transfers, `address` and `previousOwner` come from the derived state.
 */
export function proposeBlock(chain: Chain, op: NewOperation, timestamp?: string): Result<Block, OperationError> {
  const last = chain[chain.length - 1];
  if (!last) {
    return fail('INVALID_DATA', 'A cadeia está vazia: falta o bloco gênese');
  }
  if (timestamp !== undefined && !isIsoUtcTimestamp(timestamp)) {
    return fail('INVALID_DATA', 'O timestamp deve estar no formato ISO 8601 em UTC (ex.: 2026-11-25T14:00:00.000Z)');
  }

  const derived = deriveState(chain);
  if (!derived.ok) return derived;
  const state = derived.value;

  let data: RegistrationData | TransferData;
  if (op?.operation === 'REGISTRATION') {
    data = {
      operation: 'REGISTRATION',
      propertyId: normalizePropertyId(op.propertyId),
      address: normalizeText(op.address),
      owner: normalizeText(op.owner),
    };
  } else if (op?.operation === 'TRANSFER') {
    const propertyId = normalizePropertyId(op.propertyId);
    const property = propertyId ? findProperty(state, propertyId) : undefined;
    if (propertyId && propertyId.length <= MAX_PROPERTY_ID_LENGTH && !property) {
      return fail('PROPERTY_NOT_FOUND', `O imóvel ${propertyId} não está cadastrado`);
    }
    data = {
      operation: 'TRANSFER',
      propertyId,
      address: property?.address ?? '',
      previousOwner: property?.currentOwner ?? '',
      newOwner: normalizeText(op.newOwner),
    };
  } else {
    return fail('INVALID_DATA', 'Operação desconhecida');
  }

  const check = validateOperation(state, data);
  if (!check.ok) return check;

  return { ok: true, value: createBlock(last, data, timestamp) };
}
