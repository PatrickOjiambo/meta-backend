import type { Request, Response } from "express";
import { DrawHistory, Treasury } from "../models/index.js";
import type { GetUserHistoryQuery, GetUserStatsParams } from "../schemas/validation.schemas.js";

/**
 * Get user treasury stats
 * GET /api/v1/user/:address/stats
 */
export async function getUserStats(
  req: Request<GetUserStatsParams>,
  res: Response,
): Promise<void> {
  try {
    const { address } = req.params;

    const treasury = await Treasury.findOne({ public_key: address });

    if (!treasury) {
      res.status(404).json({
        error: "Not found",
        message: "User treasury not found",
      });
      return;
    }

    // Calculate total rewards
    const totalRewards = treasury.reward_history.reduce((sum, reward) => {
      return sum + BigInt(reward.amount);
    }, BigInt(0));

    res.json({
      public_key: treasury.public_key,
      total_deposited: treasury.total_deposited,
      current_balance: treasury.current_balance,
      pending_unstake: treasury.pending_unstake,
      pvcspr_balance: treasury.pvcspr_balance,
      first_deposit_date: treasury.first_deposit_date?.toISOString() ?? null,
      last_activity_date: treasury.last_activity_date.toISOString(),
      total_rewards: totalRewards.toString(),
      win_count: treasury.reward_history.length,
    });
  }
  catch (error) {
    console.error("Error getting user stats:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch user stats",
    });
  }
}

/**
 * Get user transaction history
 * GET /api/v1/user/:address/history
 */
export async function getUserHistory(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { address } = req.params as GetUserStatsParams;
    const { page = 1, limit = 20, type } = req.query as unknown as GetUserHistoryQuery;

    const treasury = await Treasury.findOne({ public_key: address });

    if (!treasury) {
      res.status(404).json({
        error: "Not found",
        message: "User treasury not found",
      });
      return;
    }

    // Filter transactions by type if specified
    let transactions = treasury.transaction_history;
    if (type) {
      transactions = transactions.filter(tx => tx.type === type);
    }

    // Sort by timestamp descending
    const sortedTransactions = [...transactions].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTransactions = sortedTransactions.slice(startIndex, endIndex);

    res.json({
      public_key: address,
      page,
      limit,
      total: sortedTransactions.length,
      total_pages: Math.ceil(sortedTransactions.length / limit),
      transactions: paginatedTransactions.map(tx => ({
        type: tx.type,
        amount: tx.amount,
        deploy_hash: tx.deploy_hash,
        timestamp: tx.timestamp.toISOString(),
        block_height: tx.block_height,
      })),
    });
  }
  catch (error) {
    console.error("Error getting user history:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch user history",
    });
  }
}

/**
 * Get user reward history
 * GET /api/v1/user/:address/rewards
 */
export async function getUserRewards(
  req: Request<GetUserStatsParams>,
  res: Response,
): Promise<void> {
  try {
    const { address } = req.params;

    const treasury = await Treasury.findOne({ public_key: address });

    if (!treasury) {
      res.status(404).json({
        error: "Not found",
        message: "User treasury not found",
      });
      return;
    }

    // Sort rewards by timestamp descending
    const sortedRewards = [...treasury.reward_history].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );

    res.json({
      public_key: address,
      total_wins: sortedRewards.length,
      rewards: sortedRewards.map(reward => ({
        draw_id: reward.draw_id,
        amount: reward.amount,
        timestamp: reward.timestamp.toISOString(),
        rank: reward.rank,
        total_winners: reward.total_winners,
      })),
    });
  }
  catch (error) {
    console.error("Error getting user rewards:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch user rewards",
    });
  }
}

/**
 * Get vault information (public endpoint)
 * GET /api/v1/vault/info
 */
export async function getVaultInfo(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    // Calculate total value locked
    const treasuries = await Treasury.find({});
    const totalValueLocked = treasuries.reduce((sum, treasury) => {
      return sum + BigInt(treasury.current_balance) + BigInt(treasury.pending_unstake);
    }, BigInt(0));

    // Get total participants (users with deposits)
    const totalParticipants = await Treasury.countDocuments({
      $or: [
        { current_balance: { $gt: "0" } },
        { pending_unstake: { $gt: "0" } },
      ],
    });

    // Get last draw
    const lastDraw = await DrawHistory.findOne({ status: "completed" })
      .sort({ completed_at: -1 });

    // Get next pending draw
    const nextDraw = await DrawHistory.findOne({ status: "pending" })
      .sort({ initiated_at: -1 });

    // Calculate total rewards distributed
    const completedDraws = await DrawHistory.find({ status: "completed" });
    const totalRewardsDistributed = completedDraws.reduce((sum, draw) => {
      return sum + BigInt(draw.total_reward_pool);
    }, BigInt(0));

    res.json({
      total_value_locked: totalValueLocked.toString(),
      total_participants: totalParticipants,
      next_draw_date: nextDraw?.initiated_at.toISOString() ?? null,
      last_draw_date: lastDraw?.completed_at?.toISOString() ?? null,
      total_rewards_distributed: totalRewardsDistributed.toString(),
      current_reward_pool: "0", // Would query from contract in production
    });
  }
  catch (error) {
    console.error("Error getting vault info:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch vault info",
    });
  }
}

/**
 * Get draw history (public endpoint)
 * GET /api/v1/vault/draws
 */
export async function getDrawHistory(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const page = Number.parseInt(req.query.page as string) || 1;
    const limit = Math.min(Number.parseInt(req.query.limit as string) || 10, 50);

    const skip = (page - 1) * limit;

    const draws = await DrawHistory.find({ status: "completed" })
      .sort({ completed_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await DrawHistory.countDocuments({ status: "completed" });

    res.json({
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      draws: draws.map(draw => ({
        draw_id: draw.draw_id,
        status: draw.status,
        total_reward_pool: draw.total_reward_pool,
        winner_count: draw.winner_count,
        initiated_at: draw.initiated_at.toISOString(),
        completed_at: draw.completed_at?.toISOString() ?? null,
        winners: draw.winners.map(w => ({
          public_key: w.public_key,
          rank: w.rank,
          reward_amount: w.reward_amount,
        })),
      })),
    });
  }
  catch (error) {
    console.error("Error getting draw history:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to fetch draw history",
    });
  }
}
