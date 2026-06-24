import mongoose, { Schema, Document } from 'mongoose';

export interface IPassenger extends Document {
  nombre: string;
  dni?: string;
  telefono?: string;
  email?: string;
  totalViajes: number;
  montoTotalGastado: number;
  createdAt: Date;
  updatedAt: Date;
}

const PassengerSchema = new Schema<IPassenger>(
  {
    nombre: { type: String, required: true, trim: true },
    dni: { type: String, unique: true, sparse: true },
    telefono: { type: String },
    email: { type: String, lowercase: true, trim: true },
    totalViajes: { type: Number, default: 0 },
    montoTotalGastado: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PassengerSchema.index({ dni: 1 }, { sparse: true });

export const Passenger = mongoose.model<IPassenger>('Passenger', PassengerSchema);
