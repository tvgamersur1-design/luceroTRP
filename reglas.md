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
