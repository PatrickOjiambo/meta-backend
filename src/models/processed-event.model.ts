import mongoose, { type Document, Schema } from "mongoose";

export type EventType = "Deposit" | "UnstakeRequest" | "Withdrawal" | "RewardDistribution";

export interface IProcessedEvent extends Document {
  deploy_hash: string;
  event_type: EventType;
  event_id: string;
  block_height: number;
  timestamp: Date;
  public_key: string;
  amount?: string;
  processed_at: Date;
  metadata?: Record<string, unknown>;
}

const ProcessedEventSchema = new Schema<IProcessedEvent>({
  deploy_hash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  event_type: {
    type: String,
    enum: ["Deposit", "UnstakeRequest", "Withdrawal", "RewardDistribution"],
    required: true,
    index: true,
  },
  event_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  block_height: {
    type: Number,
    required: true,
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
  },
  public_key: {
    type: String,
    required: true,
    index: true,
  },
  amount: {
    type: String,
  },
  processed_at: {
    type: Date,
    required: true,
    default: Date.now,
  },
  metadata: {
    type: Schema.Types.Mixed,
  },
});

// Compound index for event replay
ProcessedEventSchema.index({ block_height: 1, event_id: 1 });
ProcessedEventSchema.index({ event_type: 1, timestamp: -1 });

export const ProcessedEvent = mongoose.model<IProcessedEvent>("ProcessedEvent", ProcessedEventSchema);
