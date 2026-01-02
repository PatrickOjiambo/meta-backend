import type { Request, Response } from "express";
import { DrawHistory, Treasury } from "../models/index.js";
import type {
  DistributeRewardsBody,
  DrawWinnersBody,
  ManualDepositBody,
  ResyncEventsBody,
  TriggerUnstakeBody,
} from "../schemas/validation.schemas.js";
import { casperContractService } from "../services/casper-contract.service.js";
import type { CasperEvent } from "../services/event-watcher.service.js";
import { eventWatcherService } from "../services/event-watcher.service.js";
import { winnerSelectionEngine } from "../services/winner-selection.service.js";

/**
 * Trigger unstake processing for users
 * POST /api/v1/admin/process-unstake
 */
export async function processUnstake(
  req: Request<object, any, TriggerUnstakeBody>,
  res: Response,
): Promise<void> {
  try {
    const { public_keys } = req.body;

    console.log(`[Admin] Processing unstake for ${public_keys.length} users`);

    // Validate that all users have pending unstake
    const treasuries = await Treasury.find({
      public_key: { $in: public_keys },
      pending_unstake: { $gt: "0" },
    });

    if (treasuries.length !== public_keys.length) {
      res.status(400).json({
        error: "Invalid request",
        message: "Some users do not have pending unstake",
        valid_users: treasuries.map(t => t.public_key),
      });
      return;
    }

    // Call contract to process unstake
    const result = await casperContractService.processUnstake(public_keys);

    if (!result.success) {
      res.status(500).json({
        error: "Contract call failed",
        message: result.error ?? "Failed to process unstake",
      });
      return;
    }

    res.json({
      success: true,
      deploy_hash: result.deploy_hash,
      public_keys,
      message: "Unstake processing initiated",
    });
  }
  catch (error) {
    console.error("Error processing unstake:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Failed to process unstake",
    });
  }
}

/**
 * Draw winners for the lottery
 * POST /api/v1/admin/draw
 */
export async function drawWinners(
  req: Request<object, any, DrawWinnersBody>,
  res: Response,
): Promise<void> {
  try {
    const { winner_count, use_future_block, block_offset } = req.body;

    console.log(`[Admin] Initiating draw with ${winner_count} winners`);

    // Check if there's a pending draw
    const pendingDraw = await DrawHistory.findOne({ status: "pending" });
    if (pendingDraw) {
      res.status(400).json({
        error: "Draw already pending",
        message: "There is already a pending draw. Finalize it first.",
        draw_id: pendingDraw.draw_id,
      });
      return;
    }

    // Run the draw
    const result = await winnerSelectionEngine.runDraw({
      winnerCount: winner_count,
      useFutureBlock: use_future_block,
      blockOffset: block_offset,
    });

    res.json({
      success: true,
      draw_id: result.draw_id,
      snapshot_id: result.snapshot_id,
      total_reward_pool: result.total_reward_pool,
      winners: result.winners,
      status: result.winners.length > 0 ? "completed" : "pending",
      block_height_used: result.block_height_used,
      message: result.winners.length > 0
        ? "Winners selected successfully"
        : "Draw pending - waiting for future block",
    });
  }
  catch (error) {
    console.error("Error drawing winners:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Failed to draw winners",
    });
  }
}

/**
 * Finalize a pending draw
 * POST /api/v1/admin/draw/:draw_id/finalize
 */
export async function finalizeDraw(
  req: Request<{ draw_id: string }>,
  res: Response,
): Promise<void> {
  try {
    const { draw_id } = req.params;

    console.log(`[Admin] Finalizing draw ${draw_id}`);

    const result = await winnerSelectionEngine.finalizePendingDraw(draw_id);

    res.json({
      success: true,
      draw_id: result.draw_id,
      winners: result.winners,
      total_reward_pool: result.total_reward_pool,
      message: "Draw finalized successfully",
    });
  }
  catch (error) {
    console.error("Error finalizing draw:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Failed to finalize draw",
    });
  }
}

/**
 * Distribute rewards to winners
 * POST /api/v1/admin/distribute-rewards
 */
export async function distributeRewards(
  req: Request<object, any, DistributeRewardsBody>,
  res: Response,
): Promise<void> {
  try {
    const { draw_id, dry_run } = req.body;

    console.log(`[Admin] Distributing rewards for draw ${draw_id} (dry_run: ${dry_run})`);

    const draw = await DrawHistory.findOne({ draw_id });
    if (!draw) {
      res.status(404).json({
        error: "Not found",
        message: "Draw not found",
      });
      return;
    }

    if (draw.status !== "completed") {
      res.status(400).json({
        error: "Invalid status",
        message: `Draw is not completed (status: ${draw.status})`,
      });
      return;
    }

    // Check if already distributed
    const alreadyDistributed = draw.winners.every(w => w.distributed);
    if (alreadyDistributed && !dry_run) {
      res.status(400).json({
        error: "Already distributed",
        message: "Rewards have already been distributed for this draw",
      });
      return;
    }

    if (dry_run) {
      res.json({
        success: true,
        dry_run: true,
        draw_id,
        winners: draw.winners.map(w => ({
          public_key: w.public_key,
          rank: w.rank,
          reward_amount: w.reward_amount,
          distributed: w.distributed,
        })),
        total_amount: draw.total_reward_pool,
        message: "Dry run - no actual distribution performed",
      });
      return;
    }

    // Prepare winners for contract call
    const winnersForContract = draw.winners.map(w => ({
      public_key: w.public_key,
      amount: w.reward_amount,
    }));

    // Call contract to distribute rewards
    const result = await casperContractService.distributeRewards(draw_id, winnersForContract);

    if (!result.success) {
      res.status(500).json({
        error: "Contract call failed",
        message: result.error ?? "Failed to distribute rewards",
      });
      return;
    }

    // Update draw record
    draw.winners.forEach((winner) => {
      winner.distributed = true;
      winner.distribution_deploy_hash = result.deploy_hash;
    });
    await draw.save();

    res.json({
      success: true,
      deploy_hash: result.deploy_hash,
      draw_id,
      winners_count: draw.winners.length,
      total_distributed: draw.total_reward_pool,
      message: "Rewards distribution initiated",
    });
  }
  catch (error) {
    console.error("Error distributing rewards:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Failed to distribute rewards",
    });
  }
}

/**
 * Manual deposit (for testing or emergency use)
 * POST /api/v1/admin/manual-deposit
 */
export async function manualDeposit(
  req: Request<object, any, ManualDepositBody>,
  res: Response,
): Promise<void> {
  try {
    const { public_key, amount, deploy_hash } = req.body;

    console.log(`[Admin] Manual deposit: ${amount} motes for ${public_key}`);

    // Create a fake event
    const event: CasperEvent = {
      event_id: `manual_${deploy_hash}`,
      deploy_hash,
      block_height: await casperContractService.getCurrentBlockHeight(),
      timestamp: new Date().toISOString(),
      event_type: "Deposit",
      data: {
        public_key,
        amount,
      },
    };

    // Process the event
    await eventWatcherService.processEvent(event);

    res.json({
      success: true,
      public_key,
      amount,
      deploy_hash,
      message: "Manual deposit processed",
    });
  }
  catch (error) {
    console.error("Error processing manual deposit:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Failed to process manual deposit",
    });
  }
}

/**
 * Resync events from blockchain
 * POST /api/v1/admin/resync
 */
export async function resyncEvents(
  req: Request<object, any, ResyncEventsBody>,
  res: Response,
): Promise<void> {
  try {
    const { from_block, to_block } = req.body;

    console.log(`[Admin] Resyncing events from block ${from_block} to ${to_block ?? "latest"}`);

    await eventWatcherService.replayEvents(from_block, to_block);

    res.json({
      success: true,
      from_block,
      to_block: to_block ?? "latest",
      message: "Event resync completed (stub mode)",
    });
  }
  catch (error) {
    console.error("Error resyncing events:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Failed to resync events",
    });
  }
}

/**
 * Get system stats (admin only)
 * GET /api/v1/admin/stats
 */
export async function getSystemStats(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const totalUsers = await Treasury.countDocuments();
    const activeUsers = await Treasury.countDocuments({
      current_balance: { $gt: "0" },
    });

    const allTreasuries = await Treasury.find();
    const totalLocked = allTreasuries.reduce((sum, t) => {
      return sum + BigInt(t.current_balance) + BigInt(t.pending_unstake);
    }, BigInt(0));

    const totalDraws = await DrawHistory.countDocuments();
    const completedDraws = await DrawHistory.countDocuments({ status: "completed" });
    const pendingDraws = await DrawHistory.countDocuments({ status: "pending" });

    const allDraws = await DrawHistory.find({ status: "completed" });
    const totalRewards = allDraws.reduce((sum, d) => {
      return sum + BigInt(d.total_reward_pool);
    }, BigInt(0));

    res.json({
      users: {
        total: totalUsers,
        active: activeUsers,
      },
      vault: {
        total_locked: totalLocked.toString(),
      },
      draws: {
        total: totalDraws,
        completed: completedDraws,
        pending: pendingDraws,
      },
      rewards: {
        total_distributed: totalRewards.toString(),
      },
    });
  }
  catch (error) {
    console.error("Error getting system stats:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch system stats",
    });
  }
}
