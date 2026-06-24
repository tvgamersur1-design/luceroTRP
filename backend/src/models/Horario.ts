import mongoose, { Schema, Document } from 'mongoose';

export interface IHorario extends Document {
  hora: string;
  label: string;
  activo: boolean;
  adminId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const HorarioSchema = new Schema<IHorario>(
  {
    hora: { type: String, required: true },
    label: { type: String, required: true },
    activo: { type: Boolean, default: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const Horario = mongoose.model<IHorario>('Horario', HorarioSchema);
