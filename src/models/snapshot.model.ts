import mongoose, { type Document, Schema } from "mongoose";

export interface ISnapshotEntry {
  public_key: string;
  balance: string;
  tickets: number;
  hold_duration_hours: number;
  weight_multiplier: number;
}

export interface ISnapshot extends Document {
  draw_id: string;
  snapshot_at: Date;
  total_balance: string;
  total_tickets: number;
  participant_count: number;
  entries: ISnapshotEntry[];
  block_height: number;
  seed?: string;
  created_at: Date;
}

const SnapshotEntrySchema = new Schema<ISnapshotEntry>({
  public_key: {
    type: String,
    required: true,
  },
  balance: {
    type: String,
    required: true,
  },
  tickets: {
    type: Number,
    required: true,
  },
  hold_duration_hours: {
    type: Number,
    required: true,
  },
  weight_multiplier: {
    type: Number,
    required: true,
  },
}, { _id: false });

const SnapshotSchema = new Schema<ISnapshot>({
  draw_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  snapshot_at: {
    type: Date,
    required: true,
    index: true,
  },
  total_balance: {
    type: String,
    required: true,
  },
  total_tickets: {
    type: Number,
    required: true,
  },
  participant_count: {
    type: Number,
    required: true,
  },
  entries: {
    type: [SnapshotEntrySchema],
    required: true,
  },
  block_height: {
    type: Number,
    required: true,
  },
  seed: {
    type: String,
  },
  created_at: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

// Indexes for querying
SnapshotSchema.index({ snapshot_at: -1 });
SnapshotSchema.index({ "entries.public_key": 1 });

export const Snapshot = mongoose.model<ISnapshot>("Snapshot", SnapshotSchema);
