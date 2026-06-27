import mongoose, { Schema, Document } from 'mongoose';

export interface ITrip extends Document {
  rutaId: mongoose.Types.ObjectId;
  vehiculoId: mongoose.Types.ObjectId;
  choferId: mongoose.Types.ObjectId;
  horaSalida: string;
  ayudantes: {
    choferId: mongoose.Types.ObjectId;
    nombre: string;
  }[];
  estado: 'planificado' | 'en_transito' | 'completado' | 'cancelado';
  fechaInicio: Date;
  fechaFin?: Date;
  pasajeros: {
    pasajeroId: mongoose.Types.ObjectId;
    montoPagado: number;
    metodoPago: 'efectivo' | 'yape' | 'plin' | 'tarjeta';
    timestamp: Date;
    asientos?: number[];
    estado: 'reservado' | 'en_terminal' | 'abordado' | 'bajado';
    destino?: string;
    tarifaId?: mongoose.Types.ObjectId;
    paradaBajada?: string;
    fechaBajada?: Date;
  }[];
  ingresoTotal: number;
  combustibleInicial?: number;
  combustibleFinal?: number;
  kilometrosRecorridos?: number;
  observaciones?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TripSchema = new Schema<ITrip>(
  {
    rutaId: { type: Schema.Types.ObjectId, ref: 'Route', required: true },
    vehiculoId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    choferId: { type: Schema.Types.ObjectId, ref: 'Driver', required: true },
    horaSalida: { type: String, default: '' },
    ayudantes: [
      {
        choferId: { type: Schema.Types.ObjectId, ref: 'Driver' },
        nombre: { type: String },
      },
    ],
    estado: {
      type: String,
      enum: ['planificado', 'en_transito', 'completado', 'cancelado'],
      default: 'planificado',
    },
    fechaInicio: { type: Date, required: true },
    fechaFin: { type: Date },
    pasajeros: [
      {
        pasajeroId: { type: Schema.Types.ObjectId, ref: 'Passenger', required: true },
        montoPagado: { type: Number, required: true, min: 0 },
        metodoPago: { type: String, enum: ['efectivo', 'yape', 'plin', 'tarjeta'], required: true },
        timestamp: { type: Date, default: Date.now },
        asientos: [{ type: Number }],
        estado: { type: String, enum: ['reservado', 'en_terminal', 'abordado', 'bajado'], default: 'abordado' },
        destino: { type: String },
        tarifaId: { type: Schema.Types.ObjectId, ref: 'Fare' },
        paradaBajada: { type: String },
        fechaBajada: { type: Date },
      },
    ],
    ingresoTotal: { type: Number, default: 0 },
    combustibleInicial: { type: Number },
    combustibleFinal: { type: Number },
    kilometrosRecorridos: { type: Number },
    observaciones: { type: String },
  },
  { timestamps: true }
);

TripSchema.index({ rutaId: 1, fechaInicio: -1 });
TripSchema.index({ choferId: 1, fechaInicio: -1 });
TripSchema.index({ estado: 1 });

export const Trip = mongoose.model<ITrip>('Trip', TripSchema);
