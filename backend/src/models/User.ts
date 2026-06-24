import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password: string;
  nombre: string;
  rol: 'super-admin' | 'admin' | 'chofer';
  adminId?: mongoose.Types.ObjectId;
  activo: boolean;
  ultimoAcceso?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    nombre: { type: String, required: true, trim: true },
    rol: { type: String, enum: ['super-admin', 'admin', 'chofer'], required: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    activo: { type: Boolean, default: true },
    ultimoAcceso: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
