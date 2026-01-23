import mongoose, { type Document, Schema } from "mongoose";

export type UnstakeRequestStatus = "pending" | "processing" | "completed" | "failed";

export interface IUnstakeRequest extends Document {
  public_key: string;
  amount: string; // in motes
  deploy_hash: string;
  status: UnstakeRequestStatus;
  request_timestamp: Date;
  processed_timestamp?: Date;
  withdraw_deploy_hash?: string;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

const UnstakeRequestSchema = new Schema<IUnstakeRequest>({
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
    required: true,
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
  withdraw_deploy_hash: {
    type: String,
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

// Indexes for query optimization
UnstakeRequestSchema.index({ status: 1, request_timestamp: 1 });

export const UnstakeRequest = mongoose.model<IUnstakeRequest>("UnstakeRequest", UnstakeRequestSchema);
