import { z } from "zod/v4";

// Common schemas
export const casperPublicKeySchema = z.string()

export const amountSchema = z.string().regex(
  /^\d+$/,
  "Amount must be a positive integer string (in motes)",
);

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// User endpoint schemas
export const getUserStatsParamsSchema = z.object({
  address: casperPublicKeySchema,
});

export const getUserHistoryParamsSchema = z.object({
  address: casperPublicKeySchema,
});

export const getUserHistoryQuerySchema = paginationSchema.extend({
  type: z.enum(["Deposit", "Withdrawal", "Reward", "Unstake"]).optional(),
});

// Admin endpoint schemas
export const triggerUnstakeBodySchema = z.object({
  public_keys: z.array(casperPublicKeySchema).min(1).max(50),
});

export const drawWinnersBodySchema = z.object({
  winner_count: z.number().int().positive().max(100).default(5),
  use_future_block: z.boolean().default(true),
  block_offset: z.number().int().positive().default(10),
});

export const distributeRewardsBodySchema = z.object({
  draw_id: z.string().uuid(),
  dry_run: z.boolean().default(false),
});

export const manualDepositBodySchema = z.object({
  public_key: casperPublicKeySchema,
  amount: amountSchema,
  deploy_hash: z.string().min(1),
});

export const resyncEventsBodySchema = z.object({
  from_block: z.number().int().nonnegative(),
  to_block: z.number().int().nonnegative().optional(),
});

// Response schemas (for documentation)
export const treasuryStatsResponseSchema = z.object({
  public_key: z.string(),
  total_deposited: z.string(),
  current_balance: z.string(),
  pending_unstake: z.string(),
  pvcspr_balance: z.string(),
  first_deposit_date: z.string().datetime().nullable(),
  last_activity_date: z.string().datetime(),
  total_rewards: z.string(),
  win_count: z.number(),
});

export const vaultInfoResponseSchema = z.object({
  total_value_locked: z.string(),
  total_participants: z.number(),
  next_draw_date: z.string().datetime().nullable(),
  last_draw_date: z.string().datetime().nullable(),
  total_rewards_distributed: z.string(),
  current_reward_pool: z.string(),
});

export const drawResultResponseSchema = z.object({
  draw_id: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
  winner_count: z.number(),
  total_reward_pool: z.string(),
  winners: z.array(z.object({
    public_key: z.string(),
    rank: z.number(),
    reward_amount: z.string(),
    distributed: z.boolean(),
  })),
  initiated_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
});
export const signedDeploySchema = z.object({
  signatureHex: z.string(),
  publicKeyHex: z.string(),
  deployJSON: z.any(),
  // signedDeploy: z.any()
})

// Type exports
export type SignedDeploySchema = z.infer<typeof signedDeploySchema>;
export type GetUserStatsParams = z.infer<typeof getUserStatsParamsSchema>;
export type GetUserHistoryParams = z.infer<typeof getUserHistoryParamsSchema>;
export type GetUserHistoryQuery = z.infer<typeof getUserHistoryQuerySchema>;
export type TriggerUnstakeBody = z.infer<typeof triggerUnstakeBodySchema>;
export type DrawWinnersBody = z.infer<typeof drawWinnersBodySchema>;
export type DistributeRewardsBody = z.infer<typeof distributeRewardsBodySchema>;
export type ManualDepositBody = z.infer<typeof manualDepositBodySchema>;
export type ResyncEventsBody = z.infer<typeof resyncEventsBodySchema>;
export type TreasuryStatsResponse = z.infer<typeof treasuryStatsResponseSchema>;
export type VaultInfoResponse = z.infer<typeof vaultInfoResponseSchema>;
export type DrawResultResponse = z.infer<typeof drawResultResponseSchema>;
