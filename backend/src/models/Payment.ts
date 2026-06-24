import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  viajeId: mongoose.Types.ObjectId;
  pasajeroId: mongoose.Types.ObjectId;
  monto: number;
  metodoPago: 'efectivo' | 'yape' | 'plin' | 'tarjeta';
  estado: 'pendiente' | 'completado' | 'fallido' | 'reembolsado';
  referencia?: string;
  fechaPago: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    viajeId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    pasajeroId: { type: Schema.Types.ObjectId, ref: 'Passenger', required: true },
    monto: { type: Number, required: true, min: 0 },
    metodoPago: { type: String, enum: ['efectivo', 'yape', 'plin', 'tarjeta'], required: true },
    estado: { type: String, enum: ['pendiente', 'completado', 'fallido', 'reembolsado'], default: 'pendiente' },
    referencia: { type: String },
    fechaPago: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

PaymentSchema.index({ viajeId: 1 });
PaymentSchema.index({ pasajeroId: 1, fechaPago: -1 });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
