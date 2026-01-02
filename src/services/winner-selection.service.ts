import crypto from "node:crypto";
import { env } from "../env.js";
import { DrawHistory, type ISnapshotEntry, Snapshot, Treasury } from "../models/index.js";
import { casperContractService } from "./casper-contract.service.js";

export interface DrawConfig {
  winnerCount: number;
  useFutureBlock: boolean;
  blockOffset: number;
}

export interface WinnerResult {
  public_key: string;
  rank: number;
  tickets_won: number;
  reward_amount: string;
}

export interface DrawResult {
  draw_id: string;
  snapshot_id: string;
  total_reward_pool: string;
  winners: WinnerResult[];
  seed: string;
  block_height_used: number;
}

export class WinnerSelectionEngine {
  /**
   * Calculate tickets for a user based on balance and hold duration
   * Implements weight multiplier for longer holding periods
   */
  calculateTickets(balance: string, holdDurationHours: number): number {
    const balanceInCspr = Number(BigInt(balance) / BigInt(1_000_000_000)); // Convert motes to CSPR
    const baseTickets = Math.floor(balanceInCspr / 10); // 1 ticket per 10 CSPR

    // Apply weight multiplier based on hold duration
    const weightMultiplier = this.calculateWeightMultiplier(holdDurationHours);

    return Math.floor(baseTickets * weightMultiplier);
  }

  /**
   * Calculate weight multiplier based on hold duration
   * Rewards users who have held their deposits longer
   */
  calculateWeightMultiplier(holdDurationHours: number): number {
    const minHoldDuration = env.MIN_HOLD_DURATION_HOURS;

    if (holdDurationHours < minHoldDuration) {
      return 0; // Not eligible if below minimum hold duration
    }

    // Progressive multiplier:
    // 24 hours = 1.0x
    // 7 days = 1.2x
    // 30 days = 1.5x
    // 90 days = 2.0x
    // 180 days = 2.5x
    // 365 days = 3.0x

    const days = holdDurationHours / 24;

    if (days < 7) return 1.0;
    if (days < 30) return 1.2;
    if (days < 90) return 1.5;
    if (days < 180) return 2.0;
    if (days < 365) return 2.5;
    return 3.0;
  }

  /**
   * Create a snapshot of all eligible participants
   */
  async createSnapshot(drawId: string): Promise<string> {
    console.log(`[WinnerSelection] Creating snapshot for draw ${drawId}`);

    const currentTime = new Date();
    const blockHeight = await casperContractService.getCurrentBlockHeight();

    // Find all treasuries with positive balance
    const treasuries = await Treasury.find({
      current_balance: { $gt: "0" },
    });

    console.log(`[WinnerSelection] Found ${treasuries.length} eligible participants`);

    const entries: ISnapshotEntry[] = [];
    let totalTickets = 0;
    let totalBalance = BigInt(0);

    for (const treasury of treasuries) {
      const balance = treasury.current_balance;
      const balanceBigInt = BigInt(balance);

      // Skip if balance is too low
      if (balanceBigInt < BigInt(10_000_000_000)) { // Less than 10 CSPR
        continue;
      }

      // Calculate hold duration
      const firstDeposit = treasury.first_deposit_date ?? treasury.created_at;
      const holdDurationMs = currentTime.getTime() - firstDeposit.getTime();
      const holdDurationHours = holdDurationMs / (1000 * 60 * 60);

      // Calculate tickets
      const weightMultiplier = this.calculateWeightMultiplier(holdDurationHours);
      const tickets = this.calculateTickets(balance, holdDurationHours);

      // Skip if not eligible (below minimum hold duration)
      if (tickets === 0) {
        continue;
      }

      entries.push({
        public_key: treasury.public_key,
        balance,
        tickets,
        hold_duration_hours: holdDurationHours,
        weight_multiplier: weightMultiplier,
      });

      totalTickets += tickets;
      totalBalance += balanceBigInt;
    }

    // Create snapshot document
    const snapshot = await Snapshot.create({
      draw_id: drawId,
      snapshot_at: currentTime,
      total_balance: totalBalance.toString(),
      total_tickets: totalTickets,
      participant_count: entries.length,
      entries,
      block_height: blockHeight,
    });

    console.log(`[WinnerSelection] Snapshot created: ${snapshot._id}`);
    console.log(`[WinnerSelection] Total participants: ${entries.length}`);
    console.log(`[WinnerSelection] Total tickets: ${totalTickets}`);
    console.log(`[WinnerSelection] Total balance: ${totalBalance.toString()} motes`);

    return snapshot._id.toString();
  }

  /**
   * Select winners using deterministic random selection
   */
  async selectWinners(
    snapshotId: string,
    winnerCount: number,
    seed: string,
  ): Promise<WinnerResult[]> {
    console.log(`[WinnerSelection] Selecting ${winnerCount} winners`);
    console.log(`[WinnerSelection] Seed: ${seed}`);

    const snapshot = await Snapshot.findById(snapshotId);
    if (!snapshot) {
      throw new Error("Snapshot not found");
    }

    if (snapshot.entries.length === 0) {
      throw new Error("No eligible participants in snapshot");
    }

    // Adjust winner count if we have fewer participants
    const actualWinnerCount = Math.min(winnerCount, snapshot.entries.length);

    // Create a weighted ticket pool
    const ticketPool: Array<{ public_key: string, ticketRange: [number, number] }> = [];
    let cumulativeTickets = 0;

    for (const entry of snapshot.entries) {
      const startTicket = cumulativeTickets;
      const endTicket = cumulativeTickets + entry.tickets - 1;

      ticketPool.push({
        public_key: entry.public_key,
        ticketRange: [startTicket, endTicket],
      });

      cumulativeTickets += entry.tickets;
    }

    console.log(`[WinnerSelection] Total ticket pool: ${cumulativeTickets}`);

    // Select winners using deterministic random selection
    const winners: WinnerResult[] = [];
    const selectedPublicKeys = new Set<string>();

    for (let rank = 1; rank <= actualWinnerCount; rank++) {
      // Generate deterministic random number for this rank
      const randomValue = this.generateDeterministicRandom(seed, rank, cumulativeTickets);

      // Find the winner
      const winner = ticketPool.find(
        entry =>
          randomValue >= entry.ticketRange[0]
          && randomValue <= entry.ticketRange[1]
          && !selectedPublicKeys.has(entry.public_key),
      );

      if (winner) {
        const entry = snapshot.entries.find(e => e.public_key === winner.public_key)!;

        winners.push({
          public_key: winner.public_key,
          rank,
          tickets_won: entry.tickets,
          reward_amount: "0", // Will be calculated later
        });

        selectedPublicKeys.add(winner.public_key);
      }
      else {
        // Fallback: select first non-selected participant
        const fallbackEntry = snapshot.entries.find(e => !selectedPublicKeys.has(e.public_key));
        if (fallbackEntry) {
          winners.push({
            public_key: fallbackEntry.public_key,
            rank,
            tickets_won: fallbackEntry.tickets,
            reward_amount: "0",
          });
          selectedPublicKeys.add(fallbackEntry.public_key);
        }
      }
    }

    console.log(`[WinnerSelection] Selected ${winners.length} winners`);

    return winners;
  }

  /**
   * Generate deterministic random number from seed
   * Uses crypto.createHash for deterministic output
   */
  private generateDeterministicRandom(seed: string, rank: number, max: number): number {
    const input = `${seed}_${rank}`;
    const hash = crypto.createHash("sha256").update(input).digest("hex");

    // Convert first 8 bytes of hash to number
    const num = Number.parseInt(hash.substring(0, 16), 16);

    // Map to range [0, max]
    return num % max;
  }

  /**
   * Calculate and distribute reward amounts to winners
   * Top winners get larger shares
   */
  calculateRewardDistribution(
    totalRewardPool: string,
    winners: WinnerResult[],
  ): WinnerResult[] {
    const poolBigInt = BigInt(totalRewardPool);
    const winnerCount = winners.length;

    if (winnerCount === 0) {
      return [];
    }

    // Progressive distribution:
    // 1st place: 40%
    // 2nd place: 25%
    // 3rd place: 15%
    // 4th place: 10%
    // 5th+ place: Split remaining 10% equally

    const distributions: Record<number, number> = {
      1: 40,
      2: 25,
      3: 15,
      4: 10,
      5: 10,
    };

    const updatedWinners: WinnerResult[] = [];
    let remaining = poolBigInt;

    for (let i = 0; i < winnerCount; i++) {
      const winner = winners[i];
      const rank = winner.rank;

      let rewardAmount: bigint;

      if (rank <= 4) {
        // Fixed percentage for top 4
        rewardAmount = (poolBigInt * BigInt(distributions[rank])) / BigInt(100);
      }
      else {
        // Split remaining among 5th+ places
        const remainingWinners = winnerCount - 4;
        const remainingPercentage = distributions[5];
        const sharePerWinner = (poolBigInt * BigInt(remainingPercentage)) / BigInt(100) / BigInt(remainingWinners);
        rewardAmount = sharePerWinner;
      }

      updatedWinners.push({
        ...winner,
        reward_amount: rewardAmount.toString(),
      });

      remaining -= rewardAmount;
    }

    // Distribute any remaining dust to first place winner
    if (remaining > BigInt(0) && updatedWinners.length > 0) {
      const firstWinner = updatedWinners[0];
      const currentAmount = BigInt(firstWinner.reward_amount);
      firstWinner.reward_amount = (currentAmount + remaining).toString();
    }

    return updatedWinners;
  }

  /**
   * Main function to run a complete draw
   */
  async runDraw(config: DrawConfig): Promise<DrawResult> {
    console.log("[WinnerSelection] Starting draw");

    const drawId = crypto.randomUUID();

    // Get seed (future block hash or current block hash)
    let seed: string;
    let blockHeightUsed: number;

    if (config.useFutureBlock) {
      const currentBlock = await casperContractService.getCurrentBlockHeight();
      blockHeightUsed = currentBlock + config.blockOffset;
      seed = `future_block_${blockHeightUsed}`;
      console.log(`[WinnerSelection] Will use future block ${blockHeightUsed} for seed`);
    }
    else {
      blockHeightUsed = await casperContractService.getCurrentBlockHeight();
      seed = await casperContractService.getBlockHash(blockHeightUsed);
      console.log(`[WinnerSelection] Using current block ${blockHeightUsed} hash as seed`);
    }

    // Create snapshot
    const snapshotId = await this.createSnapshot(drawId);

    // Query total reward pool from contract
    const rewardPoolFromContract = await casperContractService.queryContractState("reward_pool") as string;
    const totalRewardPool = rewardPoolFromContract ?? "100000000000"; // 100 CSPR fallback

    // If using future block, we need to wait
    if (config.useFutureBlock) {
      console.log("[WinnerSelection] Draw initiated, waiting for future block...");

      // Create pending draw record
      await DrawHistory.create({
        draw_id: drawId,
        status: "pending",
        snapshot_id: snapshotId,
        total_reward_pool: totalRewardPool,
        winner_count: config.winnerCount,
        seed,
        block_height_used: blockHeightUsed,
        winners: [],
      });

      return {
        draw_id: drawId,
        snapshot_id: snapshotId,
        total_reward_pool: totalRewardPool,
        winners: [],
        seed,
        block_height_used: blockHeightUsed,
      };
    }

    // Select winners immediately
    const winners = await this.selectWinners(snapshotId, config.winnerCount, seed);

    // Calculate reward distribution
    const winnersWithRewards = this.calculateRewardDistribution(totalRewardPool, winners);

    // Save draw history
    await DrawHistory.create({
      draw_id: drawId,
      status: "completed",
      snapshot_id: snapshotId,
      total_reward_pool: totalRewardPool,
      winner_count: winnersWithRewards.length,
      winners: winnersWithRewards.map(w => ({
        public_key: w.public_key,
        rank: w.rank,
        tickets_won: w.tickets_won,
        reward_amount: w.reward_amount,
        distributed: false,
      })),
      seed,
      block_height_used: blockHeightUsed,
      completed_at: new Date(),
    });

    console.log("[WinnerSelection] Draw completed successfully");

    return {
      draw_id: drawId,
      snapshot_id: snapshotId,
      total_reward_pool: totalRewardPool,
      winners: winnersWithRewards,
      seed,
      block_height_used: blockHeightUsed,
    };
  }

  /**
   * Finalize a pending draw once the future block is available
   */
  async finalizePendingDraw(drawId: string): Promise<DrawResult> {
    console.log(`[WinnerSelection] Finalizing pending draw ${drawId}`);

    const draw = await DrawHistory.findOne({ draw_id: drawId });
    if (!draw) {
      throw new Error("Draw not found");
    }

    if (draw.status !== "pending") {
      throw new Error("Draw is not in pending status");
    }

    // Check if block is available now
    const currentBlock = await casperContractService.getCurrentBlockHeight();
    if (currentBlock < draw.block_height_used) {
      throw new Error(`Block ${draw.block_height_used} not yet available (current: ${currentBlock})`);
    }

    // Get the block hash
    const blockHash = await casperContractService.getBlockHash(draw.block_height_used);

    // Select winners
    const winners = await this.selectWinners(draw.snapshot_id, draw.winner_count, blockHash);

    // Calculate reward distribution
    const winnersWithRewards = this.calculateRewardDistribution(draw.total_reward_pool, winners);

    // Update draw
    draw.status = "completed";
    draw.seed = blockHash;
    draw.winners = winnersWithRewards.map(w => ({
      public_key: w.public_key,
      rank: w.rank,
      tickets_won: w.tickets_won,
      reward_amount: w.reward_amount,
      distributed: false,
    }));
    draw.completed_at = new Date();

    await draw.save();

    console.log("[WinnerSelection] Draw finalized successfully");

    return {
      draw_id: drawId,
      snapshot_id: draw.snapshot_id,
      total_reward_pool: draw.total_reward_pool,
      winners: winnersWithRewards,
      seed: blockHash,
      block_height_used: draw.block_height_used,
    };
  }
}

export const winnerSelectionEngine = new WinnerSelectionEngine();
