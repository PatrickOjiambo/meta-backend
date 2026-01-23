import mongoose, { Document, Schema } from "mongoose";

export type DepositRequestStatus = "pending" | "processing" | "completed" | "failed";

export interface IDepositRequest extends Document {
  public_key: string;
  amount: string;
  deploy_hash: string;
  status: DepositRequestStatus;
  request_timestamp: Date;
  processed_timestamp?: Date;
  verification_timestamp?: Date;
  error_message?: string;
  pvcspr_minted?: string;
}

const depositRequestSchema = new Schema<IDepositRequest>(
  {
    public_key: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: String,
      required: true,
    },
    deploy_hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    request_timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    processed_timestamp: {
      type: Date,
    },
    verification_timestamp: {
      type: Date,
    },
    error_message: {
      type: String,
    },
    pvcspr_minted: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
depositRequestSchema.index({ public_key: 1, status: 1 });
depositRequestSchema.index({ request_timestamp: -1 });

export const DepositRequest = mongoose.model<IDepositRequest>("DepositRequest", depositRequestSchema);
