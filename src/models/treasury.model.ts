import mongoose, { type Document, Schema } from "mongoose";

export type TransactionType = "Deposit" | "Withdrawal" | "Reward" | "Unstake";

export interface ITransaction {
  type: TransactionType;
  amount: string;
  deploy_hash: string;
  timestamp: Date;
  block_height?: number;
}

export interface IReward {
  draw_id: string;
  amount: string;
  timestamp: Date;
  rank: number;
  total_winners: number;
}

export interface ITreasury extends Document {
  public_key: string;
  total_deposited: string;
  current_balance: string;
  pending_unstake: string;
  pvcspr_balance: string;
  first_deposit_date?: Date;
  last_activity_date: Date;
  transaction_history: ITransaction[];
  reward_history: IReward[];
  created_at: Date;
  updated_at: Date;
}

const TransactionSchema = new Schema<ITransaction>({
  type: {
    type: String,
    enum: ["Deposit", "Withdrawal", "Reward", "Unstake"],
    required: true,
  },
  amount: {
    type: String,
    required: true,
  },
  deploy_hash: {
    type: String,
    required: true,
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
  },
  block_height: {
    type: Number,
  },
}, { _id: false });

const RewardSchema = new Schema<IReward>({
  draw_id: {
    type: String,
    required: true,
    index: true,
  },
  amount: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
  },
  rank: {
    type: Number,
    required: true,
  },
  total_winners: {
    type: Number,
    required: true,
  },
}, { _id: false });

const TreasurySchema = new Schema<ITreasury>({
  public_key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  total_deposited: {
    type: String,
    required: true,
    default: "0",
  },
  current_balance: {
    type: String,
    required: true,
    default: "0",
  },
  pending_unstake: {
    type: String,
    required: true,
    default: "0",
  },
  pvcspr_balance: {
    type: String,
    required: true,
    default: "0",
  },
  first_deposit_date: {
    type: Date,
  },
  last_activity_date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  transaction_history: {
    type: [TransactionSchema],
    default: [],
  },
  reward_history: {
    type: [RewardSchema],
    default: [],
  },
}, {
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
});

// Indexes for query optimization
TreasurySchema.index({ current_balance: -1 });
TreasurySchema.index({ "transaction_history.timestamp": -1 });
TreasurySchema.index({ "reward_history.draw_id": 1 });

export const Treasury = mongoose.model<ITreasury>("Treasury", TreasurySchema);
