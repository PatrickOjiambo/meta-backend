import axios from "axios";

export interface DeployStatus {
  success: boolean;
  status: "processed" | "pending" | "failed" | "unknown";
  deployHash: string;
  blockHeight?: number;
  errorMessage?: string;
  timestamp?: string;
  entryPoint?: string;
  args?: any;
  cost?: string;
  refundAmount?: string;
}

const CSPR_LIVE_API = "https://api.testnet.cspr.live";
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;

export class DeployVerificationService {
  /**
   * Verify a deploy by querying the Casper Live API
   * Retries multiple times if the deploy is not found yet
   */
  async verifyDeploy(deployHash: string): Promise<DeployStatus> {
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        console.log(`[DeployVerification] Attempt ${attempt}/${MAX_RETRY_ATTEMPTS} for deploy: ${deployHash}`);
        
        const response = await axios.get(`${CSPR_LIVE_API}/deploys/${deployHash}`, {
          timeout: 10000,
        });

        if (response.data && response.data.data) {
          const deployData = response.data.data;
          
          // Check if the deploy was successfully processed
          const isProcessed = deployData.status === "processed";
          const hasError = deployData.error_message !== null && deployData.error_message !== undefined;

          let status: DeployStatus["status"] = "unknown";
          if (isProcessed && !hasError) {
            status = "processed";
          } else if (hasError) {
            status = "failed";
          } else {
            status = "pending";
          }

          const result: DeployStatus = {
            success: status === "processed",
            status,
            deployHash,
            blockHeight: deployData.block_height,
            errorMessage: deployData.error_message,
            timestamp: deployData.timestamp,
            entryPoint: deployData.contract_entrypoint?.name,
            args: deployData.args,
            cost: deployData.cost,
            refundAmount: deployData.refund_amount,
          };

          console.log(`[DeployVerification] Deploy ${deployHash} status: ${status}`);
          
          if (status === "processed" || status === "failed") {
            return result;
          }

          // If still pending, continue retrying
        }
      } catch (error: any) {
        if (error.response?.status === 404) {
          console.log(`[DeployVerification] Deploy ${deployHash} not found yet (404), retrying...`);
        } else {
          console.error(`[DeployVerification] Error verifying deploy ${deployHash}:`, error.message);
        }
      }

      // Wait before retrying (except on last attempt)
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    // After all retries, return unknown status
    return {
      success: false,
      status: "unknown",
      deployHash,
      errorMessage: "Deploy verification timeout - status could not be confirmed after multiple attempts",
    };
  }

  /**
   * Quick check without retries (for background processing)
   */
  async quickCheckDeploy(deployHash: string): Promise<DeployStatus> {
    try {
      const response = await axios.get(`${CSPR_LIVE_API}/deploys/${deployHash}`, {
        timeout: 5000,
      });

      if (response.data && response.data.data) {
        const deployData = response.data.data;
        
        const isProcessed = deployData.status === "processed";
        const hasError = deployData.error_message !== null;

        let status: DeployStatus["status"] = "unknown";
        if (isProcessed && !hasError) {
          status = "processed";
        } else if (hasError) {
          status = "failed";
        } else {
          status = "pending";
        }

        return {
          success: status === "processed",
          status,
          deployHash,
          blockHeight: deployData.block_height,
          errorMessage: deployData.error_message,
          timestamp: deployData.timestamp,
          entryPoint: deployData.contract_entrypoint?.name,
          args: deployData.args,
        };
      }

      return {
        success: false,
        status: "unknown",
        deployHash,
      };
    } catch (error: any) {
      return {
        success: false,
        status: error.response?.status === 404 ? "pending" : "unknown",
        deployHash,
        errorMessage: error.message,
      };
    }
  }
}

export const deployVerificationService = new DeployVerificationService();
