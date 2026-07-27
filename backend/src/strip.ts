import mongoose from 'mongoose';
import { config } from './config';
import { Trip } from './models/Trip';
import { Passenger } from './models/Passenger';
import { Payment } from './models/Payment';
import { Location } from './models/Location';
import { Alert } from './models/Alert';
import { Incident } from './models/Incident';

const stripDatabase = async () => {
  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('Conectado a MongoDB\n');

    console.log('=== CONTEO ANTES DE ELIMINAR ===');
    const tripsBefore = await Trip.countDocuments();
    const passengersBefore = await Passenger.countDocuments();
    const paymentsBefore = await Payment.countDocuments();
    const locationsBefore = await Location.countDocuments();
    const alertsBefore = await Alert.countDocuments();
    const incidentsBefore = await Incident.countDocuments();

    console.log(`  Trips (viajes):      ${tripsBefore}`);
    console.log(`  Passengers (pasajeros): ${passengersBefore}`);
    console.log(`  Payments (pagos):    ${paymentsBefore}`);
    console.log(`  Locations (GPS):     ${locationsBefore}`);
    console.log(`  Alerts (alertas):    ${alertsBefore}`);
    console.log(`  Incidents (incidencias): ${incidentsBefore}`);
    console.log('');

    console.log('Eliminando documentos...');
    const tripsDeleted = await Trip.deleteMany({});
    const passengersDeleted = await Passenger.deleteMany({});
    const paymentsDeleted = await Payment.deleteMany({});
    const locationsDeleted = await Location.deleteMany({});
    const alertsDeleted = await Alert.deleteMany({});
    const incidentsDeleted = await Incident.deleteMany({});

    console.log('\n=== RESULTADO DE ELIMINACION ===');
    console.log(`  Trips eliminados:      ${tripsDeleted.deletedCount}`);
    console.log(`  Passengers eliminados: ${passengersDeleted.deletedCount}`);
    console.log(`  Payments eliminados:   ${paymentsDeleted.deletedCount}`);
    console.log(`  Locations eliminados:  ${locationsDeleted.deletedCount}`);
    console.log(`  Alerts eliminados:     ${alertsDeleted.deletedCount}`);
    console.log(`  Incidents eliminados:  ${incidentsDeleted.deletedCount}`);

    console.log('\n=== CONTEO DESPUES DE ELIMINAR ===');
    console.log(`  Trips:      ${await Trip.countDocuments()}`);
    console.log(`  Passengers: ${await Passenger.countDocuments()}`);
    console.log(`  Payments:   ${await Payment.countDocuments()}`);
    console.log(`  Locations:  ${await Location.countDocuments()}`);
    console.log(`  Alerts:     ${await Alert.countDocuments()}`);
    console.log(`  Incidents:  ${await Incident.countDocuments()}`);

    await mongoose.disconnect();
    console.log('\nDesconectado de MongoDB');
    console.log('Strip completado exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

stripDatabase();
