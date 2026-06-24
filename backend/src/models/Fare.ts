import mongoose, { Schema, Document } from 'mongoose';

export interface IFare extends Document {
  rutaId: mongoose.Types.ObjectId;
  nombre: string;
  origenTramo: string;
  destinoTramo: string;
  distanciaKm: number;
  precio: number;
  moneda: string;
  activa: boolean;
  fechaVigencia?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FareSchema = new Schema<IFare>(
  {
    rutaId: { type: Schema.Types.ObjectId, ref: 'Route', required: true },
    nombre: { type: String, required: true },
    origenTramo: { type: String, default: '' },
    destinoTramo: { type: String, default: '' },
    distanciaKm: { type: Number, default: 0, min: 0 },
    precio: { type: Number, required: true, min: 0 },
    moneda: { type: String, default: 'PEN' },
    activa: { type: Boolean, default: true },
    fechaVigencia: { type: Date },
  },
  { timestamps: true }
);

export const Fare = mongoose.model<IFare>('Fare', FareSchema);
