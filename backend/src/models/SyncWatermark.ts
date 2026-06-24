import mongoose, { Schema, Document } from 'mongoose';

export interface ISyncWatermark extends Document {
  deviceId: string;
  lastSyncDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SyncWatermarkSchema = new Schema<ISyncWatermark>(
  {
    deviceId: { type: String, required: true, unique: true },
    lastSyncDate: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

SyncWatermarkSchema.index({ deviceId: 1 });

export const SyncWatermark = mongoose.model<ISyncWatermark>(
  'SyncWatermark',
  SyncWatermarkSchema
);
