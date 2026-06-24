import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Trip } from '../models/Trip';
import { Driver } from '../models/Driver';
import { Vehicle } from '../models/Vehicle';

const router = Router();

// GET /api/dashboard/stats - Obtener estadísticas del dashboard
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Contar viajes de hoy
    const viajesHoy = await Trip.countDocuments({
      fecha: { $gte: today },
    });

    // Calcular ingresos de hoy
    const viajesCompletados = await Trip.find({
      fecha: { $gte: today },
      estado: 'Completado',
    }).populate('rutaId');

    let ingresosHoy = 0;
    viajesCompletados.forEach((viaje: any) => {
      if (viaje.ingresoTotal) {
        ingresosHoy += viaje.ingresoTotal;
      }
    });

    // Contar vehículos activos
    const totalVehiculos = await Vehicle.countDocuments({ activo: true });

    // Contar choferes activos
    const totalChoferes = await Driver.countDocuments({ activo: true });

    // Calcular ocupación (ejemplo: porcentaje de vehículos en uso)
    const vehiculosEnUso = await Trip.countDocuments({
      fecha: { $gte: today },
      estado: { $in: ['En Tránsito', 'Planificado'] },
    });
    const ocupacion = totalVehiculos > 0 ? Math.round((vehiculosEnUso / totalVehiculos) * 100) : 0;

    res.json({
      ingresosHoy,
      viajesHoy,
      totalVehiculos,
      totalChoferes,
      ocupacion,
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
  }
});

export { router as dashboardRoutes };
