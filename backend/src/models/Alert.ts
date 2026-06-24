import mongoose, { Schema, Document } from 'mongoose';

export interface IAlert extends Document {
  tipo: 'bateria_baja' | 'sin_gps' | 'velocidad_excesiva' | 'desviacion_ruta' | 'mantenimiento';
  titulo: string;
  descripcion: string;
  nivel: 'info' | 'warning' | 'critical';
  vehiculoId?: mongoose.Types.ObjectId;
  choferId?: mongoose.Types.ObjectId;
  viajeId?: mongoose.Types.ObjectId;
  leida: boolean;
  atendida: boolean;
  usuarioAtendio?: mongoose.Types.ObjectId;
  fechaAtencion?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AlertSchema = new Schema<IAlert>(
  {
    tipo: { type: String, enum: ['bateria_baja', 'sin_gps', 'velocidad_excesiva', 'desviacion_ruta', 'mantenimiento'], required: true },
    titulo: { type: String, required: true },
    descripcion: { type: String, required: true },
    nivel: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    vehiculoId: { type: Schema.Types.ObjectId, ref: 'Vehicle' },
    choferId: { type: Schema.Types.ObjectId, ref: 'Driver' },
    viajeId: { type: Schema.Types.ObjectId, ref: 'Trip' },
    leida: { type: Boolean, default: false },
    atendida: { type: Boolean, default: false },
    usuarioAtendio: { type: Schema.Types.ObjectId, ref: 'User' },
    fechaAtencion: { type: Date },
  },
  { timestamps: true }
);

AlertSchema.index({ leida: 1, nivel: 1 });
AlertSchema.index({ createdAt: -1 });

export const Alert = mongoose.model<IAlert>('Alert', AlertSchema);
