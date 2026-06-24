import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  usuarioId: mongoose.Types.ObjectId;
  accion: string;
  entidad: string;
  entidadId?: mongoose.Types.ObjectId;
  datosAnteriores?: Record<string, unknown>;
  datosNuevos?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    usuarioId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    accion: { type: String, required: true },
    entidad: { type: String, required: true },
    entidadId: { type: Schema.Types.ObjectId },
    datosAnteriores: { type: Schema.Types.Mixed },
    datosNuevos: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

AuditLogSchema.index({ usuarioId: 1, createdAt: -1 });
AuditLogSchema.index({ entidad: 1, entidadId: 1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
