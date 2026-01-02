import mongoose, { type Document, Schema } from "mongoose";

export interface IAdminNonce extends Document {
  public_key: string;
  current_nonce: number;
  last_used_at: Date;
  updated_at: Date;
}

const AdminNonceSchema = new Schema<IAdminNonce>({
  public_key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  current_nonce: {
    type: Number,
    required: true,
    default: 0,
  },
  last_used_at: {
    type: Date,
    required: true,
    default: Date.now,
  },
}, {
  timestamps: {
    updatedAt: "updated_at",
    createdAt: false,
  },
});

export const AdminNonce = mongoose.model<IAdminNonce>("AdminNonce", AdminNonceSchema);
