import mongoose, { type Document, Schema } from "mongoose";

export type DrawStatus = "pending" | "in_progress" | "completed" | "failed";

export interface IWinner {
  public_key: string;
  rank: number;
  tickets_won: number;
  reward_amount: string;
  distributed: boolean;
  distribution_deploy_hash?: string;
}

export interface IDrawHistory extends Document {
  draw_id: string;
  status: DrawStatus;
  snapshot_id: string;
  initiated_at: Date;
  completed_at?: Date;
  total_reward_pool: string;
  winner_count: number;
  winners: IWinner[];
  seed: string;
  block_height_used: number;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

const WinnerSchema = new Schema<IWinner>({
  public_key: {
    type: String,
    required: true,
  },
  rank: {
    type: Number,
    required: true,
  },
  tickets_won: {
    type: Number,
    required: true,
  },
  reward_amount: {
    type: String,
    required: true,
  },
  distributed: {
    type: Boolean,
    required: true,
    default: false,
  },
  distribution_deploy_hash: {
    type: String,
  },
}, { _id: false });

const DrawHistorySchema = new Schema<IDrawHistory>({
  draw_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  status: {
    type: String,
    enum: ["pending", "in_progress", "completed", "failed"],
    required: true,
    default: "pending",
    index: true,
  },
  snapshot_id: {
    type: String,
    required: true,
    index: true,
  },
  initiated_at: {
    type: Date,
    required: true,
    default: Date.now,
  },
  completed_at: {
    type: Date,
  },
  total_reward_pool: {
    type: String,
    required: true,
  },
  winner_count: {
    type: Number,
    required: true,
  },
  winners: {
    type: [WinnerSchema],
    default: [],
  },
  seed: {
    type: String,
    required: true,
  },
  block_height_used: {
    type: Number,
    required: true,
  },
  error_message: {
    type: String,
  },
}, {
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
});

// Indexes for efficient querying
DrawHistorySchema.index({ initiated_at: -1 });
DrawHistorySchema.index({ status: 1, initiated_at: -1 });
DrawHistorySchema.index({ "winners.public_key": 1 });

export const DrawHistory = mongoose.model<IDrawHistory>("DrawHistory", DrawHistorySchema);
