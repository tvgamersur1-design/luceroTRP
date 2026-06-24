import mongoose, { Schema, Document } from 'mongoose';

export interface IRoute extends Document {
  nombre: string;
  origen: string;
  destino: string;
  paradas: string[];
  tiempoEstimadoMin: number;
  terreno: string;
  origenesExtendidos: string[];
  destinosExtendidos: string[];
  activa: boolean;
  coordenadas?: number[][];
  createdAt: Date;
  updatedAt: Date;
}

const RouteSchema = new Schema<IRoute>(
  {
    nombre: { type: String, required: true, trim: true },
    origen: { type: String, required: true },
    destino: { type: String, required: true },
    paradas: [{ type: String }],
    tiempoEstimadoMin: { type: Number, required: true, min: 0 },
    terreno: { type: String, default: '' },
    origenesExtendidos: [{ type: String }],
    destinosExtendidos: [{ type: String }],
    activa: { type: Boolean, default: true },
    coordenadas: [[Number]],
  },
  { timestamps: true }
);

export const Route = mongoose.model<IRoute>('Route', RouteSchema);
