/** Operation recorded in a block's `data` field. */
export type Operation = 'GENESIS' | 'REGISTRATION' | 'TRANSFER';

export type GenesisData = { operation: 'GENESIS' };

export type RegistrationData = {
  operation: 'REGISTRATION';
  propertyId: string;
  address: string;
  owner: string;
};

export type TransferData = {
  operation: 'TRANSFER';
  propertyId: string;
  /** Repeated from the registration: the property does not move physically. */
  address: string;
  previousOwner: string;
  newOwner: string;
};

export type BlockData = GenesisData | RegistrationData | TransferData;

export interface Block {
  index: number;
  /** ISO 8601 timestamp in UTC. */
  timestamp: string;
  data: BlockData;
  previousHash: string;
  /** SHA-256 hex digest of the canonical JSON of the other four fields. */
  hash: string;
}

export type Chain = Block[];

export type ChainInvalidReason =
  | 'INVALID_GENESIS'
  | 'INVALID_DATA'
  | 'INDEX_OUT_OF_SEQUENCE'
  | 'INVALID_PREVIOUS_HASH'
  | 'INVALID_HASH';

export type ChainValidationResult =
  | { valid: true; length: number }
  | { valid: false; invalidIndex: number; reason: ChainInvalidReason; message: string };

export interface HistoryEntry {
  owner: string;
  /** Timestamp of the block that made `owner` the owner. */
  since: string;
  blockIndex: number;
  operation: 'REGISTRATION' | 'TRANSFER';
}

export interface Property {
  propertyId: string;
  address: string;
  currentOwner: string;
  registeredAt: string;
  history: HistoryEntry[];
}

export interface ChainState {
  /** Properties in registration order. */
  properties: Property[];
}

export type OperationErrorCode = 'DUPLICATE_PROPERTY' | 'PROPERTY_NOT_FOUND' | 'SAME_OWNER' | 'INVALID_DATA';

export interface OperationError {
  code: OperationErrorCode;
  /** Human-readable message (pt-BR), ready for the UI. */
  message: string;
  /** Present when the error comes from replaying a block in `deriveState`. */
  blockIndex?: number;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** Write request accepted by `proposeBlock`; the core fills in the derived fields. */
export type NewOperation =
  | { operation: 'REGISTRATION'; propertyId: string; address: string; owner: string }
  | { operation: 'TRANSFER'; propertyId: string; newOwner: string };

export type GapStatus = 'NEXT' | 'GAP' | 'ALREADY_EXISTS' | 'CONFLICT';

export interface AppendBlockError {
  reason: GapStatus | ChainInvalidReason;
  message: string;
}
