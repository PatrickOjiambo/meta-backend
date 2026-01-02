/**
 * Casper SSE Event Types
 * Based on Casper 2.0 SSE Documentation
 * https://docs.casper.network/
 */

// ============================================================================
// ApiVersion Event
// ============================================================================

export interface ApiVersionEvent {
  ApiVersion: string;
}

// ============================================================================
// BlockAdded Event
// ============================================================================

export interface BlockAddedEvent {
  BlockAdded: {
    block_hash: string;
    block: {
      Version1?: BlockVersion1;
      Version2?: BlockVersion2;
    };
  };
}

export interface BlockVersion1 {
  hash: string;
  header: {
    parent_hash: string;
    state_root_hash: string;
    body_hash: string;
    random_bit: boolean;
    accumulated_seed: string;
    era_end: any | null;
    timestamp: string;
    era_id: number;
    height: number;
    protocol_version: string;
  };
  body: {
    proposer: string;
    deploy_hashes: string[];
    transfer_hashes: string[];
  };
}

export interface BlockVersion2 {
  hash: string;
  header: {
    parent_hash: string;
    state_root_hash: string;
    body_hash: string;
    random_bit: boolean;
    accumulated_seed: string;
    era_end: any | null;
    timestamp: string;
    era_id: number;
    height: number;
    protocol_version: string;
    proposer: string;
    current_gas_price: number;
    last_switch_block_hash: string;
  };
  body: {
    transactions: {
      [priority: string]: Array<{
        Version1?: string;
        Deploy?: string;
      }>;
    };
    rewarded_signatures: any[];
  };
}

// ============================================================================
// TransactionAccepted Event
// ============================================================================

export interface TransactionAcceptedEvent {
  TransactionAccepted: {
    Version1?: TransactionV1;
    Deploy?: DeployTransaction;
  };
}

export interface TransactionV1 {
  hash: string;
  payload: {
    initiator_addr: {
      PublicKey: string;
    };
    timestamp: string;
    ttl: string;
    chain_name: string;
    pricing_mode: {
      Fixed?: {
        additional_computation_factor: number;
        gas_price_tolerance: number;
      };
    };
    fields: {
      args: {
        Named: Array<[string, CLValue]>;
      };
      entry_point: string;
      scheduling: string;
      target: string;
    };
  };
  approvals: Array<{
    signer: string;
    signature: string;
  }>;
}

export interface DeployTransaction {
  hash: string;
  header: {
    account: string;
    timestamp: string;
    ttl: string;
    gas_price: number;
    body_hash: string;
    dependencies: string[];
    chain_name: string;
  };
  payment: ExecutableDeployItem;
  session: ExecutableDeployItem;
  approvals: Array<{
    signer: string;
    signature: string;
  }>;
}

export interface ExecutableDeployItem {
  ModuleBytes?: {
    module_bytes: string;
    args: Array<[string, CLValue]>;
  };
  StoredContractByName?: {
    name: string;
    entry_point: string;
    args: Array<[string, CLValue]>;
  };
  StoredContractByHash?: {
    hash: string;
    entry_point: string;
    args: Array<[string, CLValue]>;
  };
  StoredVersionedContractByHash?: {
    hash: string;
    version: number | null;
    entry_point: string;
    args: Array<[string, CLValue]>;
  };
  StoredVersionedContractByName?: {
    name: string;
    version: number | null;
    entry_point: string;
    args: Array<[string, CLValue]>;
  };
  Transfer?: {
    args: Array<[string, CLValue]>;
  };
}

export interface CLValue {
  cl_type: any;
  bytes: string;
  parsed: any;
}

// ============================================================================
// TransactionProcessed Event
// ============================================================================

export interface TransactionProcessedEvent {
  TransactionProcessed: {
    transaction_hash: {
      Version1?: string;
      Deploy?: string;
    };
    initiator_addr: {
      PublicKey: string;
    };
    timestamp: string;
    ttl: string;
    block_hash: string;
    execution_result: {
      Version1?: ExecutionResultV1;
      Success?: ExecutionSuccess;
      Failure?: ExecutionFailure;
    };
    messages?: TransactionMessage[];
  };
}

export interface ExecutionResultV1 {
  Success?: ExecutionSuccess;
  Failure?: ExecutionFailure;
}

export interface ExecutionSuccess {
  effect: {
    operations: any[];
    transforms: Array<{
      key: string;
      transform: any;
    }>;
  };
  transfers: string[];
  cost: string;
  size_estimate?: number;
}

export interface ExecutionFailure {
  effect: {
    operations: any[];
    transforms: Array<{
      key: string;
      transform: any;
    }>;
  };
  transfers: string[];
  cost: string;
  error_message: string;
}

export interface TransactionMessage {
  entity_addr: string;
  message: {
    String?: string;
    [key: string]: any;
  };
  topic_name: string;
  topic_name_hash: string;
  topic_index: number;
  block_index: number;
}

// ============================================================================
// TransactionExpired Event
// ============================================================================

export interface TransactionExpiredEvent {
  TransactionExpired: {
    transaction_hash: {
      Version1?: string;
      Deploy?: string;
    };
  };
}

// ============================================================================
// Fault Event
// ============================================================================

export interface FaultEvent {
  Fault: {
    era_id: number;
    public_key: string;
    timestamp: string;
  };
}

// ============================================================================
// FinalitySignature Event
// ============================================================================

export interface FinalitySignatureEvent {
  FinalitySignature: {
    V1?: FinalitySignatureV1;
    V2?: FinalitySignatureV2;
  };
}

export interface FinalitySignatureV1 {
  block_hash: string;
  era_id: number;
  signature: string;
  public_key: string;
}

export interface FinalitySignatureV2 {
  block_hash: string;
  block_height: number;
  era_id: number;
  chain_name_hash: string;
  signature: string;
  public_key: string;
}

// ============================================================================
// Step Event
// ============================================================================

export interface StepEvent {
  Step: {
    era_id: number;
    execution_effects: Array<{
      key: string;
      kind: any;
    }>;
  };
}

// ============================================================================
// Shutdown Event
// ============================================================================

export type ShutdownEvent = "Shutdown";

// ============================================================================
// Union of all possible SSE events
// ============================================================================

export type CasperSseEvent =
  | ApiVersionEvent
  | BlockAddedEvent
  | TransactionAcceptedEvent
  | TransactionProcessedEvent
  | TransactionExpiredEvent
  | FaultEvent
  | FinalitySignatureEvent
  | StepEvent
  | ShutdownEvent;

// ============================================================================
// Parsed Event Types (for SDK parsing)
// ============================================================================

export interface ParsedBlockAddedEvent {
  BlockAdded: {
    blockHash: string;
    block: any;
  };
}

// The SDK returns the raw event structure
export type ParsedTransactionProcessedEvent = TransactionProcessedEvent;
