import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from './config';
import { User } from './models/User';

const seedDatabase = async () => {
  try {
    await mongoose.connect(config.mongodb.uri);
    console.log('Conectado a MongoDB');

    // Verificar si ya existe un admin
    const existingAdmin = await User.findOne({ email: 'admin@lucero.com' });
    
    if (existingAdmin) {
      console.log('El usuario admin ya existe:');
      console.log('  Email: admin@lucero.com');
      console.log('  Rol:', existingAdmin.rol);
    } else {
      // Hash password
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      const admin = await User.create({
        email: 'admin@lucero.com',
        password: hashedPassword,
        nombre: 'Admin Lucero',
        rol: 'admin',
        activo: true,
      });
      console.log('Usuario admin creado:');
      console.log('  Email: admin@lucero.com');
      console.log('  Contraseña: admin123');
      console.log('  Rol:', admin.rol);
    }

    // Verificar si ya existe un super-admin
    const existingSuperAdmin = await User.findOne({ email: 'super@lucero.com' });
    
    if (!existingSuperAdmin) {
      const hashedPassword = await bcrypt.hash('super123', 10);
      
      await User.create({
        email: 'super@lucero.com',
        password: hashedPassword,
        nombre: 'Super Admin',
        rol: 'super-admin',
        activo: true,
      });
      console.log('\nUsuario super-admin creado:');
      console.log('  Email: super@lucero.com');
      console.log('  Contraseña: super123');
    }

    // Listar colecciones
    const collections = await mongoose.connection.db?.listCollections();
    console.log('\nColecciones en luceroTRPdb:');
    collections?.forEach(col => console.log('  -', col.name));

    await mongoose.disconnect();
    console.log('\nDesconectado de MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

seedDatabase();
