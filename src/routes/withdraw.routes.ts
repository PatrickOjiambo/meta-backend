import { Router, Request, Response } from "express";
import { unstakeRequestBodySchema, processWithdrawalsBodySchema } from "../schemas/validation.schemas.js";
import { UnstakeRequest } from "../models/unstake-request.model.js";
import { Treasury } from "../models/treasury.model.js";
import { casperContractService } from "../services/casper-contract.service.js";
import { standardRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { adminAuthMiddleware } from "../middlewares/admin-auth.middleware.js";
import { deployVerificationService } from "../services/deploy-verification.service.js";

const router = Router();

/**
 * POST /api/v1/unstake/request
 * Record a new unstake request from the frontend after user signs the transaction
 */
router.post("/request", standardRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = unstakeRequestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
    }

    const { public_key, amount, deploy_hash } = parsed.data;

    // Check if this deploy hash already exists
    const existingRequest = await UnstakeRequest.findOne({ deploy_hash });
    if (existingRequest) {
      return res.status(409).json({
        error: "Unstake request with this deploy hash already exists",
        request: existingRequest,
      });
    }

    // Create new unstake request
    const unstakeRequest = new UnstakeRequest({
      public_key,
      amount,
      deploy_hash,
      status: "pending",
      request_timestamp: new Date(),
    });

    await unstakeRequest.save();

    console.log(`[Unstake] New unstake request recorded: ${deploy_hash} for ${public_key}`);

    // Start verification process in the background
    verifyAndProcessUnstake(unstakeRequest).catch(error => {
      console.error(`[Unstake] Error in background verification for ${deploy_hash}:`, error);
    });

    res.status(201).json({
      message: "Unstake request recorded successfully. Verification in progress.",
      request: {
        public_key: unstakeRequest.public_key,
        amount: unstakeRequest.amount,
        deploy_hash: unstakeRequest.deploy_hash,
        status: unstakeRequest.status,
        request_timestamp: unstakeRequest.request_timestamp,
      },
    });
  } catch (error) {
    console.error("Error recording unstake request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/v1/unstake/status/:deployHash
 * Check the status of a specific unstake request
 */
router.get("/status/:deployHash", standardRateLimiter, async (req: Request, res: Response) => {
  try {
    const { deployHash } = req.params;

    const unstakeRequest = await UnstakeRequest.findOne({ deploy_hash: deployHash });

    if (!unstakeRequest) {
      return res.status(404).json({
        error: "Unstake request not found",
      });
    }

    res.json({
      unstake: {
        public_key: unstakeRequest.public_key,
        amount: unstakeRequest.amount,
        deploy_hash: unstakeRequest.deploy_hash,
        status: unstakeRequest.status,
        request_timestamp: unstakeRequest.request_timestamp,
        processed_timestamp: unstakeRequest.processed_timestamp,
        error_message: unstakeRequest.error_message,
        withdraw_deploy_hash: unstakeRequest.withdraw_deploy_hash,
      },
    });
  } catch (error) {
    console.error("Error fetching unstake status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/v1/unstake/pending
 * Get all pending unstake requests (admin only)
 */
router.get("/pending", adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const pendingRequests = await UnstakeRequest.find({ status: "pending" })
      .sort({ request_timestamp: 1 })
      .limit(100);

    res.json({
      count: pendingRequests.length,
      requests: pendingRequests,
    });
  } catch (error) {
    console.error("Error fetching pending unstake requests:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/v1/unstake/process-withdrawals
 * Trigger withdrawal processing for pending unstake requests (admin only)
 * This calls the contract's withdraw function to process the unstake queue
 */
router.post("/process-withdrawals", adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = processWithdrawalsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
    }

    const { dry_run } = parsed.data;

    // Get pending unstake requests
    const pendingRequests = await UnstakeRequest.find({ status: "pending" })
      .sort({ request_timestamp: 1 })
      .limit(50);

    if (pendingRequests.length === 0) {
      return res.json({
        message: "No pending unstake requests to process",
        processed: 0,
      });
    }

    if (dry_run) {
      return res.json({
        message: "Dry run - would process these requests",
        count: pendingRequests.length,
        requests: pendingRequests.map(r => ({
          public_key: r.public_key,
          amount: r.amount,
          deploy_hash: r.deploy_hash,
        })),
      });
    }

    // Mark requests as processing
    const requestIds = pendingRequests.map(r => r._id);
    await UnstakeRequest.updateMany(
      { _id: { $in: requestIds } },
      { status: "processing" }
    );

    // Call the contract's withdraw function
    const result = await casperContractService.processWithdrawals();

    if (result.success) {
      // Mark requests as completed
      await UnstakeRequest.updateMany(
        { _id: { $in: requestIds } },
        {
          status: "completed",
          processed_timestamp: new Date(),
          withdraw_deploy_hash: result.deploy_hash,
        }
      );

      console.log(`[Unstake] Processed ${pendingRequests.length} withdrawal requests. Deploy hash: ${result.deploy_hash}`);

      res.json({
        message: "Withdrawals processed successfully",
        processed: pendingRequests.length,
        deploy_hash: result.deploy_hash,
      });
    } else {
      // Revert to pending status on failure
      await UnstakeRequest.updateMany(
        { _id: { $in: requestIds } },
        {
          status: "failed",
          error_message: result.error,
        }
      );

      res.status(500).json({
        error: "Failed to process withdrawals",
        details: result.error,
      });
    }
  } catch (error) {
    console.error("Error processing withdrawals:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Background function to verify and process an unstake request
 */
async function verifyAndProcessUnstake(unstakeRequest: any) {
  try {
    console.log(`[Unstake] Starting verification for ${unstakeRequest.deploy_hash}`);

    // Update status to processing
    unstakeRequest.status = "processing";
    await unstakeRequest.save();

    // Verify the deploy on-chain
    const deployStatus = await deployVerificationService.verifyDeploy(unstakeRequest.deploy_hash);

    if (deployStatus.success && deployStatus.status === "processed") {
      // Deploy was successful, update treasury
      console.log(`[Unstake] Deploy ${unstakeRequest.deploy_hash} verified successfully`);

      // Update treasury record to track pending unstake
      await Treasury.findOneAndUpdate(
        { public_key: unstakeRequest.public_key },
        {
          $inc: { pending_unstake: unstakeRequest.amount },
          $push: {
            transaction_history: {
              type: "Unstake",
              amount: unstakeRequest.amount,
              deploy_hash: unstakeRequest.deploy_hash,
              timestamp: new Date(),
            },
          },
          last_activity_date: new Date(),
        },
        { upsert: false }
      );

      // Keep status as pending (not completed yet, awaiting withdrawal processing)
      unstakeRequest.status = "pending";
      
      console.log(`[Unstake] Unstake ${unstakeRequest.deploy_hash} verified and recorded in treasury`);
    } else {
      // Deploy failed or couldn't be verified
      console.log(`[Unstake] Deploy ${unstakeRequest.deploy_hash} failed or couldn't be verified: ${deployStatus.status}`);
      
      unstakeRequest.status = "failed";
      unstakeRequest.error_message = deployStatus.errorMessage || `Deploy status: ${deployStatus.status}`;
    }

    await unstakeRequest.save();
  } catch (error) {
    console.error(`[Unstake] Error processing unstake ${unstakeRequest.deploy_hash}:`, error);
    
    unstakeRequest.status = "failed";
    unstakeRequest.error_message = error instanceof Error ? error.message : "Unknown error during verification";
    await unstakeRequest.save();
  }
}

export default router;
