import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceToken extends Document {
  userId: mongoose.Types.ObjectId;
  fcmToken: string;
  platform: 'android' | 'ios' | 'web';
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const deviceTokenSchema = new Schema<IDeviceToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fcmToken: { type: String, required: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], default: 'android' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

deviceTokenSchema.index({ userId: 1, active: 1 });
deviceTokenSchema.index({ fcmToken: 1 }, { unique: true });

export const DeviceToken = mongoose.model<IDeviceToken>('DeviceToken', deviceTokenSchema);
