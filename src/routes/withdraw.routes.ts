import { Router, Request, Response } from "express";
import { unstakeRequestBodySchema, processWithdrawalsBodySchema } from "../schemas/validation.schemas.js";
import { UnstakeRequest } from "../models/unstake-request.model.js";
import { Treasury } from "../models/treasury.model.js";
import { casperContractService } from "../services/casper-contract.service.js";
import { standardRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { adminAuthMiddleware } from "../middlewares/admin-auth.middleware.js";

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

    // Also update the treasury record to track pending unstake
    await Treasury.findOneAndUpdate(
      { public_key },
      {
        $inc: { pending_unstake: amount },
        $push: {
          transaction_history: {
            type: "Unstake",
            amount,
            deploy_hash,
            timestamp: new Date(),
          },
        },
        last_activity_date: new Date(),
      },
      { upsert: false }
    );

    console.log(`[Unstake] New unstake request recorded: ${deploy_hash} for ${public_key}`);

    res.status(201).json({
      message: "Unstake request recorded successfully",
      request: unstakeRequest,
    });
  } catch (error) {
    console.error("Error recording unstake request:", error);
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

export default router;
