export interface CasperDeployResponse {
  data: CasperDeployData;
}

export interface CasperDeployData {
  deploy_hash: string;
  block_hash: string;
  block_height: number;
  caller_public_key: string;
  caller_hash: string;
  execution_type_id: number;
  contract_package_hash: string;
  contract_hash: string;
  entry_point_id: number;
  args: Record<string, CasperArgument>;
  payment_amount: string;
  refund_amount: string;
  cost: string;
  consumed_gas: string;
  error_message: string | null;
  status: "processed" | "pending" | "failed"; // Extended based on common Casper statuses
  timestamp: string;
  rate: number | null;
  account_info: any | null;
  centralized_account_info: any | null;
  contract_package: ContractPackage;
  contract: Contract;
  contract_entrypoint: ContractEntrypoint;
  caller_cspr_name: string | null;
  transfers: CasperTransfer[];
  nft_token_actions: any[] | null;
  ft_token_actions: any[] | null;
}

export interface CasperArgument {
  cl_type: string | Record<string, any>; // Can be "U512" or {"List": "U8"}
  parsed: any; // Can be string, number, or array depending on cl_type
}

export interface ContractPackage {
  contract_package_hash: string;
  owner_public_key: string;
  owner_hash: string;
  name: string | null;
  description: string | null;
  metadata: Record<string, any>;
  latest_version_contract_type_id: number | null;
  timestamp: string;
  icon_url: string | null;
  website_url: string | null;
  coingecko_id: string | null;
  latest_version_contract_hash: string | null;
  account_info: any | null;
  centralized_account_info: any | null;
  coingecko_data: any | null;
  friendlymarket_data: any | null;
  csprtrade_data: any | null;
}

export interface Contract {
  block_height: number;
  contract_hash: string;
  contract_package_hash: string;
  contract_type_id: number | null;
  contract_version: number;
  deploy_hash: string;
  is_disabled: boolean;
  major_protocol_version: number;
  timestamp: string;
}

export interface ContractEntrypoint {
  action_type_id: number | null;
  contract_hash: string;
  contract_package_hash: string;
  id: number;
  name: string;
}

export interface CasperTransfer {
  id: number;
  transfer_index: number | null;
  initiator_account_hash: string;
  from_purse: string;
  to_purse: string;
  to_account_hash: string | null;
  amount: string;
  from_purse_public_key: string | null;
  to_purse_public_key: string | null;
  from_purse_account_info: any | null;
  to_purse_account_info: any | null;
  from_purse_centralized_account_info: any | null;
  to_purse_centralized_account_info: any | null;
  from_purse_cspr_name: string | null;
  to_purse_cspr_name: string | null;
}

export async function getDeploy(deployHash: string): Promise<CasperDeployResponse> {
  const url = `https://api.testnet.cspr.live/deploys/${deployHash}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Error fetching deploy: ${response.statusText}`);
    }

    const data: CasperDeployResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to get deploy:', error);
    throw error;
  }
}