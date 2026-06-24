import mongoose, { Schema, Document } from 'mongoose';

export interface ILocation extends Document {
  choferId: mongoose.Types.ObjectId;
  vehiculoId?: mongoose.Types.ObjectId;
  viajeId?: mongoose.Types.ObjectId;
  lat: number;
  lng: number;
  velocidad?: number;
  direccion?: number;
  timestamp: Date;
  createdAt: Date;
}

const LocationSchema = new Schema<ILocation>(
  {
    choferId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
    vehiculoId: { type: Schema.Types.ObjectId, ref: 'Vehicle' },
    viajeId: { type: Schema.Types.ObjectId, ref: 'Trip' },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    velocidad: { type: Number },
    direccion: { type: Number },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

LocationSchema.index({ choferId: 1, timestamp: -1 });
LocationSchema.index({ viajeId: 1, timestamp: -1 });
LocationSchema.index({ timestamp: -1 });

export const Location = mongoose.model<ILocation>('Location', LocationSchema);
