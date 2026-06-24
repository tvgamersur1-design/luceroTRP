import mongoose, { Schema, Document } from 'mongoose';

export interface ISeatConfig {
  id: string;
  x: number;
  y: number;
  numero: number;
}

export interface IVehicle extends Document {
  placa: string;
  marca: string;
  modelo: string;
  anio: number;
  capacidad: number;
  color: string;
  activo: boolean;
  configuracionAsientos?: ISeatConfig[];
  ultimaUbicacion?: {
    type: string;
    coordinates: number[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const VehicleSchema = new Schema<IVehicle>(
  {
    placa: { type: String, required: true, unique: true, uppercase: true },
    marca: { type: String, required: true },
    modelo: { type: String, required: true },
    anio: { type: Number, required: true },
    capacidad: { type: Number, required: true, min: 1 },
    color: { type: String, required: true },
    activo: { type: Boolean, default: true },
    configuracionAsientos: [{
      id: { type: String, required: true },
      x: { type: Number, required: true },
      y: { type: Number, required: true },
      numero: { type: Number, required: true },
    }],
    ultimaUbicacion: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },
  { timestamps: true }
);

VehicleSchema.index({ 'ultimaUbicacion': '2dsphere' });

export const Vehicle = mongoose.model<IVehicle>('Vehicle', VehicleSchema);
