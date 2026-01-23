import { Router, Request, Response } from "express";
import { z } from "zod/v4";
import { DepositRequest } from "../models/deposit-request.model.js";
import { Treasury } from "../models/treasury.model.js";
import { deployVerificationService } from "../services/deploy-verification.service.js";
import { standardRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { adminAuthMiddleware } from "../middlewares/admin-auth.middleware.js";

const router = Router();

// Schema for deposit request
const depositRequestBodySchema = z.object({
  public_key: z.string().min(1, "Public key is required"),
  amount: z.string().regex(/^\d+$/, "Amount must be a positive integer string (in motes)"),
  deploy_hash: z.string().min(1, "Deploy hash is required"),
});

/**
 * POST /api/v1/deposit/request
 * Record a new deposit request from the frontend after user signs the transaction
 * Then verify the deploy on-chain before confirming
 */
router.post("/request", standardRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = depositRequestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
    }

    const { public_key, amount, deploy_hash } = parsed.data;

    // Check if this deploy hash already exists
    const existingRequest = await DepositRequest.findOne({ deploy_hash });
    if (existingRequest) {
      return res.status(409).json({
        error: "Deposit request with this deploy hash already exists",
        request: existingRequest,
      });
    }

    // Create new deposit request with pending status
    const depositRequest = new DepositRequest({
      public_key,
      amount,
      deploy_hash,
      status: "pending",
      request_timestamp: new Date(),
    });

    await depositRequest.save();

    console.log(`[Deposit] New deposit request recorded: ${deploy_hash} for ${public_key}`);

    // Start verification process in the background
    // We return immediately and let the verification happen async
    verifyAndProcessDeposit(depositRequest).catch(error => {
      console.error(`[Deposit] Error in background verification for ${deploy_hash}:`, error);
    });

    res.status(201).json({
      message: "Deposit request recorded successfully. Verification in progress.",
      request: {
        public_key: depositRequest.public_key,
        amount: depositRequest.amount,
        deploy_hash: depositRequest.deploy_hash,
        status: depositRequest.status,
        request_timestamp: depositRequest.request_timestamp,
      },
    });
  } catch (error) {
    console.error("Error recording deposit request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/v1/deposit/status/:deployHash
 * Check the status of a specific deposit request
 */
router.get("/status/:deployHash", standardRateLimiter, async (req: Request, res: Response) => {
  try {
    const { deployHash } = req.params;

    const depositRequest = await DepositRequest.findOne({ deploy_hash: deployHash });

    if (!depositRequest) {
      return res.status(404).json({
        error: "Deposit request not found",
      });
    }

    res.json({
      deposit: {
        public_key: depositRequest.public_key,
        amount: depositRequest.amount,
        deploy_hash: depositRequest.deploy_hash,
        status: depositRequest.status,
        request_timestamp: depositRequest.request_timestamp,
        processed_timestamp: depositRequest.processed_timestamp,
        verification_timestamp: depositRequest.verification_timestamp,
        error_message: depositRequest.error_message,
        pvcspr_minted: depositRequest.pvcspr_minted,
      },
    });
  } catch (error) {
    console.error("Error fetching deposit status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/v1/deposit/pending
 * Get all pending deposit requests (admin only)
 */
router.get("/pending", adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const pendingRequests = await DepositRequest.find({ status: "pending" })
      .sort({ request_timestamp: 1 })
      .limit(100);

    res.json({
      count: pendingRequests.length,
      requests: pendingRequests,
    });
  } catch (error) {
    console.error("Error fetching pending deposit requests:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/v1/deposit/verify/:deployHash
 * Manually trigger verification for a specific deposit (admin only)
 */
router.post("/verify/:deployHash", adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { deployHash } = req.params;

    const depositRequest = await DepositRequest.findOne({ deploy_hash: deployHash });

    if (!depositRequest) {
      return res.status(404).json({
        error: "Deposit request not found",
      });
    }

    if (depositRequest.status === "completed") {
      return res.json({
        message: "Deposit already completed",
        request: depositRequest,
      });
    }

    // Trigger verification
    await verifyAndProcessDeposit(depositRequest);

    // Fetch updated request
    const updatedRequest = await DepositRequest.findOne({ deploy_hash: deployHash });

    res.json({
      message: "Verification triggered",
      request: updatedRequest,
    });
  } catch (error) {
    console.error("Error triggering verification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Background function to verify and process a deposit
 */
async function verifyAndProcessDeposit(depositRequest: any) {
  try {
    console.log(`[Deposit] Starting verification for ${depositRequest.deploy_hash}`);

    // Update status to processing
    depositRequest.status = "processing";
    await depositRequest.save();

    // Verify the deploy on-chain
    const deployStatus = await deployVerificationService.verifyDeploy(depositRequest.deploy_hash);

    depositRequest.verification_timestamp = new Date();

    if (deployStatus.success && deployStatus.status === "processed") {
      // Deploy was successful, update treasury and mark as completed
      console.log(`[Deposit] Deploy ${depositRequest.deploy_hash} verified successfully`);

      // Update treasury record
      await Treasury.findOneAndUpdate(
        { public_key: depositRequest.public_key },
        {
          $inc: {
            total_deposited: depositRequest.amount,
            current_balance: depositRequest.amount,
          },
          $push: {
            transaction_history: {
              type: "Deposit",
              amount: depositRequest.amount,
              deploy_hash: depositRequest.deploy_hash,
              timestamp: new Date(),
            },
          },
          $setOnInsert: {
            first_deposit_date: new Date(),
          },
          last_activity_date: new Date(),
        },
        { upsert: true }
      );

      depositRequest.status = "completed";
      depositRequest.processed_timestamp = new Date();
      
      console.log(`[Deposit] Deposit ${depositRequest.deploy_hash} completed and recorded in treasury`);
    } else {
      // Deploy failed or couldn't be verified
      console.log(`[Deposit] Deploy ${depositRequest.deploy_hash} failed or couldn't be verified: ${deployStatus.status}`);
      
      depositRequest.status = "failed";
      depositRequest.error_message = deployStatus.errorMessage || `Deploy status: ${deployStatus.status}`;
    }

    await depositRequest.save();
  } catch (error) {
    console.error(`[Deposit] Error processing deposit ${depositRequest.deploy_hash}:`, error);
    
    depositRequest.status = "failed";
    depositRequest.error_message = error instanceof Error ? error.message : "Unknown error during verification";
    await depositRequest.save();
  }
}

export default router;
