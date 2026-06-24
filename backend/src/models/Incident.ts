import mongoose, { Schema, Document } from 'mongoose';

export interface IIncident extends Document {
  tipo: 'accidente' | 'averia' | 'robo' | 'pasajero' | 'otro';
  titulo: string;
  descripcion: string;
  nivel: 'bajo' | 'medio' | 'alto' | 'critico';
  vehiculoId?: mongoose.Types.ObjectId;
  choferId?: mongoose.Types.ObjectId;
  viajeId?: mongoose.Types.ObjectId;
  ubicacion?: string;
  coordenadas?: number[];
  estado: 'reportado' | 'en_investigacion' | 'resuelto' | 'cerrado';
  reportadoPor: mongoose.Types.ObjectId;
  fotos?: string[];
  testigos?: string[];
  solucion?: string;
  resueltoPor?: mongoose.Types.ObjectId;
  fechaResolucion?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const IncidentSchema = new Schema<IIncident>(
  {
    tipo: { type: String, enum: ['accidente', 'averia', 'robo', 'pasajero', 'otro'], required: true },
    titulo: { type: String, required: true },
    descripcion: { type: String, required: true },
    nivel: { type: String, enum: ['bajo', 'medio', 'alto', 'critico'], default: 'medio' },
    vehiculoId: { type: Schema.Types.ObjectId, ref: 'Vehicle' },
    choferId: { type: Schema.Types.ObjectId, ref: 'Driver' },
    viajeId: { type: Schema.Types.ObjectId, ref: 'Trip' },
    ubicacion: { type: String },
    coordenadas: [Number],
    estado: { type: String, enum: ['reportado', 'en_investigacion', 'resuelto', 'cerrado'], default: 'reportado' },
    reportadoPor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fotos: [{ type: String }],
    testigos: [{ type: String }],
    solucion: { type: String },
    resueltoPor: { type: Schema.Types.ObjectId, ref: 'User' },
    fechaResolucion: { type: Date },
  },
  { timestamps: true }
);

IncidentSchema.index({ estado: 1, nivel: 1 });
IncidentSchema.index({ createdAt: -1 });

export const Incident = mongoose.model<IIncident>('Incident', IncidentSchema);
