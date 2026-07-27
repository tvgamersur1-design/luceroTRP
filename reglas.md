# Reglas de Flujo — Lucero TRP

## Arquitectura General

```
Backend (MongoDB) ←→ Sync Engine ←→ SQLite ←→ Zustand Store ←→ UI
                          ↑
                    Socket.IO (real-time)
```

**Regla #1: SQLite SIEMPRE es la fuente primaria.**
La app nunca depende del backend para funcionar. Todo se lee desde SQLite.

**Regla #2: El backend es espejo, no fuente.**
Los datos se copian del backend a SQLite periódicamente. La UI nunca consulta el backend directamente.

**Regla #3: Socket.IO es atajo, no reemplazo.**
Socket.IO actualiza el store en tiempo real, pero el dato siempre persiste en SQLite para sobrevivir reinicios.

---

## Flujo de Datos por Gestión

### Carga Inicial (arranque de app)

1. `loadFromSQLite()` → lee SQLite → llena Zustand Store → UI renderiza
2. `syncFromAPI()` → llama APIs del backend → guarda en SQLite + actualiza Store
3. Si no hay internet → solo paso 1 (datos de SQLite)

### Operaciones CRUD (crear, editar, desactivar)

```
UI → executeOfflineAction() → ¿Online?
  ├─ SÍ → API call → Backend MongoDB
  │       ├─ Backend emite Socket.IO → otro cliente actualiza store
  │       └─ Response → upsert en SQLite + Zustand Store
  └─ NO → Guarda en Zustand Store + SQLite
          └─ sync_queue (pendiente para sync posterior)
```

### Socket.IO (real-time)

```
Backend emita evento (ej: route:created)
  → useSocketEvents lo recibe
  → upsert en Zustand Store
  → UI se re-renderiza automáticamente
```

**Regla: Todo evento CRUD del backend DEBE emitir Socket.IO.**
Si el backend no emite el evento, el store no se actualiza en tiempo real.

---

## Estado Actual por Gestión

| Gestión | SQLite Repo | Sync from API | Socket.IO | executeOfflineAction |
|---------|:-----------:|:-------------:|:---------:|:--------------------:|
| **Rutas** | `routesRepo` | `rutasAPI.list()` | `route:*` | ✅ |
| **Tarifas** | `faresRepo` | `tarifasAPI.list()` | `fare:*` | ✅ |
| **Vehículos** | `vehiclesRepo` | `vehiculosAPI.list()` | `vehicle:*` | ✅ |
| **Choferes** | `driversRepo` | `choferesAPI.list()` | `driver:*` | ✅ |
| **Usuarios** | `usersRepo` | `usuariosAPI.list()` | `user:*` | ✅ |
| **Horarios** | `horariosRepo` | `horariosAPI.list()` | `horario:*` | ✅ |
| **Viajes** | `tripsRepo` | `viajesAPI.list()` | `trip:*` | ✅ |
| **Pasajeros** | `passengersRepo` | `pasajerosAPI.list()` | `trip:*` (vía viaje) | ✅ |
| **Notificaciones** | — | — | `driver:*`, `trip:notify` | — |

---

## Reglas de Implementación

### Al crear una nueva gestión:

1. **Crear SQLite Repo** → `services/database/*.repo.ts` con tabla en `migrations.ts`
2. **Agregar a `syncFromAPI`** → `fetchOne()` + `saveToSQLite()` + `set()` en `data.store.ts`
3. **Agregar a `sync-engine pullFromServer`** → mismo patrón que syncFromAPI
4. **Agregar Socket.IO events en backend** → `POST/PUT/DELETE` deben emitir `entity:created/updated/deleted`
5. **Agregar handlers en `useSocketEvents`** → `socket.on('entity:*', handler) → upsert/remove en store`
6. **UI lee de Zustand Store** → `useDataStore((s) => s.entity)`
7. **UI escribe via `executeOfflineAction`** → nunca API directa
8. **Nunca hacer API calls directas** → siempre pasar por sync engine o executeOfflineAction

### Al crear un componente CRUD:

```tsx
// ✅ CORRECTO — lee de store
const items = useDataStore((s) => s.routes);

// ❌ INCORRECTO — llama API directamente
const [items, setItems] = useState([]);
useEffect(() => { api.get('/rutas').then(res => setItems(res.data)); }, []);
```

```tsx
// ✅ CORRECTO — usa executeOfflineAction
await executeOfflineAction({
  tabla: 'routes',
  registroId: id,
  accion: 'create',
  datos: formData,
  apiCall: () => rutasAPI.create(formData),
});

// ❌ INCORRECTO — llama API directa sin fallback
await rutasAPI.create(formData);
```

---

## Flujo Offline → Online

```
1. App inicia → loadFromSQLite() → UI funcional con datos locales
2. Usuario crea registro → guarda en Store + SQLite + sync_queue
3. Conexión restaurada → syncEngine.sync() → envía sync_queue al backend
4. Backend procesa → emite Socket.IO → otros clientes se actualizan
```

**Regla: La app NUNCA muestra "sin conexión" como estado de error.**
La app siempre funciona con datos locales. El sync es transparente.

---

## Flujo de Notificaciones Push

### Arquitectura

```
Backend (Firebase Admin) → FCM → Dispositivo Android
                                     ↓
                              Push Notification (background)
                              Toast In-App (foreground)
```

### Registro de Token

1. Al hacer login → `notificationsService.register()` → obtiene FCM token
2. FCM token se envía al backend → `POST /api/notifications/register-token`
3. Backend guarda token en colección `devicetokens`
4. Al hacer logout → `DELETE /api/notifications/unregister-token`

### Eventos que generan notificación push

| Evento | Destinatario | Mensaje |
|--------|-------------|---------|
| Nuevo viaje creado (`POST /api/viajes`) | Chofer asignado | "Nuevo viaje asignado: {ruta}" |
| Nuevo pasajero agregado (`POST /api/viajes/:id/pasajeros`) | Chofer del viaje | "Nuevo pasajero: {nombre}" |

### Socket.IO + Push (doble capa)

- **Socket.IO**: actualización en tiempo real si la app está abierta
- **Push notification**: notificación silenciosa si la app está en background/cerrada
- Ambos se emiten simultáneamente para máxima confiabilidad

### Room `driver:{choferId}`

- El chofer se une automáticamente a su room al conectar el socket
- Los eventos `trip:created` y `trip:updated` se emiten a `admins` + `driver:{choferId}`
- Permite que el chofer reciba solo sus notificaciones, no las de todos

### Permisos Android

```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.VIBRATE" />
```

### Requisitos Firebase

1. Proyecto Firebase con app Android (`com.lucero.trp`)
2. `google-services.json` en `frontend-mobile/android/app/`
3. Service Account JSON en variable de entorno `FIREBASE_SERVICE_ACCOUNT` del backend

---

## Reglas de Validación y UX

### Confirmación obligatoria

Toda acción destructiva DEBE tener `ConfirmDialog`:

| Acción | ¿Requiere confirmación? |
|--------|:-----------------------:|
| Eliminar registro (hard delete) | **SÍ SIEMPRE** |
| Desactivar registro | **SÍ SIEMPRE** |
| Cancelar viaje | **SÍ SIEMPRE** |
| Iniciar viaje | SÍ |
| Marcar pasajero "no llegó" | SÍ |
| Completar viaje | SÍ (ya tiene modal) |

**Regla: NINGUNA acción destructiva se ejecuta sin confirmación del usuario.**

### Estado de carga (submitting)

Toda operación async DEBE tener estado de carga:

```tsx
// ✅ CORRECTO
const [submitting, setSubmitting] = useState(false);

const handleCreate = async () => {
  setSubmitting(true);
  try {
    await executeOfflineAction({...});
    showToast('Guardado', 'success');
  } finally {
    setSubmitting(false);
  }
};

<button disabled={submitting}>
  {submitting ? <Spinner /> : 'Guardar'}
</button>

// ❌ INCORRECTO — sin loading, permite doble click
const handleCreate = async () => {
  await executeOfflineAction({...});
};
<button>Guardar</button>
```

**Regla: Todo botón de acción DEBE deshabilitarse durante la operación.**

### Validación de inputs

```tsx
// ✅ CORRECTO — validación por campo con error inline
const validateForm = () => {
  const errors: Record<string, string> = {};
  if (!formData.nombre.trim()) errors.nombre = 'Requerido';
  if (formData.precio <= 0) errors.precio = 'Debe ser mayor a 0';
  return errors;
};

// ❌ INCORRECTO — sin validación, acepta cualquier cosa
const handleCreate = async () => {
  await api.post('/rutas', formData); // sin validar
};
```

**Regla: Todo formulario DEBE validar antes de enviar.**

### Patrones prohibidos

```tsx
// ❌ NUNCA hacer esto:
window.location.href = '/';           // rompe SPA
api.get('/rutas').then(setItems);      // sin offline fallback
await rutasAPI.delete(id);             // sin executeOfflineAction
<button onClick={handleDelete}>X</button>; // sin ConfirmDialog
```

---

## Estado de Corrección por Gestión

| Gestión | Confirm Dialog | Loading State | Validación | Prioridad |
|---------|:--------------:|:-------------:|:----------:|:---------:|
| AdminUsuarios | ✅ | ✅ | ✅ | — |
| AdminVehiculos | ❌ | ✅ | ✅ | Agregar confirm |
| AdminRutas | ❌ | ✅ | ✅ | Agregar confirm + cambiar a soft delete |
| AdminTarifas | ❌ | ✅ | ✅ | Agregar confirm + cambiar a soft delete |
| AdminHorarios | ❌ | ❌ | ✅ | Agregar confirm + loading |
| AdminViajes | ❌ | ❌ | ✅ | Agregar confirm + loading |
| AdminViajeDetalle | ❌ | ❌ | Parcial | Agregar confirm + loading + offline pattern |

---

## Reglas de Notificaciones

**Regla: Toda acción que afecte a un chofer específico DEBE emitir notificación push + Socket.IO a la room `driver:{choferId}`.**

- Crear viaje → push al chofer asignado
- Agregar pasajero → push al chofer del viaje
- Cambiar estado de viaje → push al chofer del viaje

**Regla: Las notificaciones push son complemento, NO reemplazo de Socket.IO.**

- Socket.IO actualiza el store en tiempo real
- Push notification informa al usuario cuando la app está en background
- Siempre emitir ambos

---

## Reglas de Tiempo de Viaje

### Ventana de Inicio
- Un viaje puede iniciarse **únicamente** entre los **30 minutos anteriores** a la `fechaInicio` y **hasta 12 horas después** de la misma.
- Si el viaje está en estado `planificado` y el tiempo no ha llegado: se muestra mensaje "El botón de iniciar estará disponible 30 minutos antes de la hora de salida".
- Si el viaje está en estado `planificado` y pasó la ventana de 12 horas: se muestra advertencia "Este viaje no fue iniciado" con opciones de iniciar o cancelar.

### Recordatorios Automáticos
- **No Iniciado:** Si un viaje está `planificado` y pasaron más de 30 minutos desde `fechaInicio`, se muestra un toast cada 10 minutos recordando "¿Iniciar o cancelar viaje?".
- **En Tránsito Largo:** Si un viaje está `en_transito` y pasaron más de 5 horas desde `fechaInicio`, se muestra un toast cada 15 minutos recordando "Recuerda completar el viaje cuando llegues".

### Estados de Viaje
| Estado | Descripción |
|--------|-------------|
| `planificado` | Viaje creado, esperando iniciar |
| `en_transito` | Viaje en curso, chofer en ruta |
| `completado` | Viaje finalizado, todos los pasajeros procesados |
| `cancelado` | Viaje cancelado por admin |
| `no_iniciado` | Viaje no fue iniciado en la ventana permitida |

---

## Reglas de Mapa de Asientos

### Estados de Asiento
| Estado | Color | Descripción |
|--------|-------|-------------|
| Libre | Verde (#22C55E) | Sin pasajero asignado |
| Reservado | Ámbar (#F59E0B) | Pasajero asignado, no ha subido |
| Ocupado (Abordado) | Rojo (#EF4444) | Pasajero subido al bus |
| En Terminal | Azul (#3B82F6) | Pasajero en terminal, esperando subir |
| En Camino | Púrpura (#8B5CF6) | Pasajero recogido en ruta |
| No Llegó | Gris (#6B7280) | Pasajero no se presentó |

### Interacción con Asientos
- Al tocar un asiento en modo vista, se abre un **modal flotante** (bottom sheet) con:
  - Información del estado actual
  - Datos del pasajero (si lo hay)
  - **Acciones contextuales** según el estado:
    - Libre → "Reservar" + "Agregar Pasajero"
    - Reservado → "Confirmar Subida" + "Cancelar Reserva"
    - Abordado → "Registrar Bajada"
    - En Terminal → "Subir al Bus"
    - En Camino → "Recoger"
    - No Llegó → "Reasignar"

### Permisos de Acción
- Las acciones en el mapa de asientos pueden ser realizadas por:
  - **Chofer** asignado al viaje
  - **Ayudantes** del viaje
  - **Admin** / **Super-Admin**

---

## Eventos Socket.IO de Pasajeros

### Eventos Específicos
| Evento | Descripción | Datos |
|--------|-------------|-------|
| `trip:passenger-added` | Nuevo pasajero agregado al viaje | `{ viajeId, pasajero }` |
| `trip:passenger-state-changed` | Estado de pasajero cambiado | `{ viajeId, pasajeroId, estado, nombre? }` |
| `trip:passenger-seat-changed` | Asiento de pasajero cambiado | `{ viajeId, pasajeroId, asientos }` |

### Eventos Generales de Viaje
| Evento | Descripción |
|--------|-------------|
| `trip:created` | Nuevo viaje creado |
| `trip:updated` | Viaje actualizado (cualquier cambio) |
| `trip:deleted` | Viaje eliminado |
| `trip:started` | Viaje iniciado (estado → en_transito) |

### Comportamiento
- Todos los clientes conectados al mismo viaje reciben los eventos y actualizan su UI en tiempo real.
- Los eventos de pasajero son más granulares que `trip:updated` para permitir actualizaciones parciales.
- El mapa de asientos se actualiza instantáneamente cuando cambia el estado de un pasajero.

---

## Reglas de Sincronización Offline

### Flujo de Datos
1. **Acción del usuario** → `executeOfflineAction()`
2. **Si online:** Llamada API → Backend MongoDB → Socket.IO a otros clientes → Respuesta → SQLite + Store
3. **Si offline:** Store + SQLite → Cola de sincronización → Sync automático al reconectar

### Conflictos
- **Último en escribir gana.** No hay merge de campos.
- El `sync-engine` procesa la cola en orden FIFO.
- Los IDs temporales (`local-*`) se reemplazan por IDs del servidor tras sincronización.
