import mongoose, { Schema, Document } from 'mongoose';

export interface IDriver extends Document {
  userId: mongoose.Types.ObjectId;
  nombre: string;
  licencia: string;
  telefono: string;
  activo: boolean;
  calificacion: number;
  totalViajes: number;
  createdAt: Date;
  updatedAt: Date;
}

const DriverSchema = new Schema<IDriver>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    nombre: { type: String, required: true, trim: true },
    licencia: { type: String, required: true, unique: true },
    telefono: { type: String, required: true },
    activo: { type: Boolean, default: true },
    calificacion: { type: Number, default: 5.0, min: 0, max: 5 },
    totalViajes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Driver = mongoose.model<IDriver>('Driver', DriverSchema);
