# Changelog — Sprint de Estabilización Productivo (2026-04-17)

Objetivo: dejar la PWA **lista para salida a productivo** desde frontend/UX/arquitectura,
sin depender de cambios nuevos en backend (pero preparada para integrarse).

---

## Fase 1 — Limpieza (✅ COMPLETADO)

### Archivos eliminados (8)

Código V1 sin uso, verificado huérfano antes de borrar:

| Archivo | Reemplazado por |
|---------|-----------------|
| `src/modules/entregas/ScreenEntregas.jsx` | `ScreenHubDia.jsx` |
| `src/modules/entregas/ScreenValidarTicket.jsx` | `ScreenOperacionDia.jsx` (tab Tickets) |
| `src/modules/entregas/ScreenPreparaCarga.jsx` | `ScreenCargaUnidades.jsx` |
| `src/modules/entregas/ScreenInventarioCedis.jsx` | `ScreenOperacionDia.jsx` (tab Inventario) |
| `src/modules/entregas/ScreenDevoluciones.jsx` | `ScreenDevolucionesV2.jsx` |
| `src/modules/ruta/ScreenMiRuta.jsx` | `ScreenMiRutaV2.jsx` |
| `src/modules/supervisor-ventas/ScreenSupervisorVentas.jsx` | `ScreenControlComercial.jsx` |
| `src/modules/supervisor-ventas/ScreenVendedores.jsx` | `ScreenControlComercial.jsx` |

**Total**: ~80 KB de código muerto eliminado.

### Rutas limpiadas

- `/entregas/aceptar-turno` → redirige a `/entregas/cierre-turno` (era duplicado)
- App.jsx: 7 imports huérfanos removidos
- Import `ScreenMiRuta` renombrado a `ScreenMiRutaV2` (el nombre importaba el V2 pero se llamaba V1, confuso)

---

## Fase 2 — Riesgos silenciosos eliminados (✅ COMPLETADO)

### Helpers nuevos

#### `src/lib/safeNumber.js`
Reemplaza los patrones peligrosos `parseFloat(x) || 0`:
- Usa `Number()` (rechaza `"12abc"` → NaN) en lugar de `parseFloat()` (acepta `"12abc"` → 12)
- Soporta `min`, `max`, `precision`, `allowNegative`
- Expone `safeNumber.isValid()` y `safeNumber.isPositive()` para validación de formularios
- Expone `fmtMoney()` formateador Intl

#### `src/lib/sessionGuards.js`
Reemplaza hardcodes peligrosos `|| 89` / `|| 34` / `|| 0`:
- `requireWarehouse(session)` → lanza `SessionIncompleteError` si falta, dispara evento `gf:session-expired`
- `requireCompany(session)` / `requireEmployee(session)` idem
- Variantes `softWarehouse` / `softCompany` / `softEmployee` → retornan `null` sin disparar evento (para pantallas que pueden mostrar placeholder)

### Aplicación

| Archivo | Cambio |
|---------|--------|
| `src/modules/admin/AdminContext.jsx` | `warehouse_id \|\| 89` → `softWarehouse(session)`. `company_id` fallback `\|\| 34` → `null` (con filtro de sucursal). |
| `src/modules/entregas/ScreenHubDia.jsx` | `softWarehouse()` + `SessionErrorState` si falta. |
| `src/modules/entregas/ScreenRecibirPT.jsx` | Idem. |
| `src/modules/entregas/ScreenCargaUnidades.jsx`, `ScreenCierreTurno.jsx`, `ScreenDevolucionesV2.jsx`, `ScreenMerma.jsx`, `ScreenOperacionDia.jsx` | `Number(x \|\| 0) \|\| null` patrón consistente. |
| `src/modules/entregas/ScreenMerma.jsx`, `ScreenDevolucionesV2.jsx`, `ScreenCierreTurno.jsx` | `parseFloat(e.target.value) \|\| 0` → `safeNumber(e.target.value, { min: 0 })`. |
| `src/modules/ruta/ScreenIncidencias.jsx` | Eliminado hardcode `company_id: 34`. |

---

## Fase 3 — Bloqueos y seguridad UI (✅ COMPLETADO)

### Cierre de caja — umbrales de autorización

En `AdminCierreForm.jsx`, nueva constante `CIERRE_THRESHOLDS`:

| Umbral | Valor | Comportamiento |
|--------|-------|----------------|
| `NOTE_REQUIRED` | $100 | Nota obligatoria ≥10 caracteres |
| `MANAGER_AUTH` | $1,000 | Nota + banner "requiere autorización gerente" |
| `DIRECTOR_AUTH` | $10,000 | Nota + banner "requiere autorización dirección" |

- `canSubmit` ahora valida: openingFundValid + physicalTotal > 0 + nota si aplica
- `blockReason` explica al usuario por qué no puede enviar
- `<AuthBanner>` visible según nivel (reusable `src/components/AuthBanner.jsx`)

### Corte de ruta — bloqueo estricto

`validateCorte()` en `routeControlService.js`:
- Antes: `remaining < 0` era warning (permitía cerrar con sobrantes)
- Ahora: cualquier diferencia (positiva o negativa) bloquea el corte
- `totalDiff !== 0` también es error, no warning

### POS — folio de terminal obligatorio

En `AdminPosForm.jsx`:
- Campo `cardRef` (folio) visible cuando `payment_method='card'`
- Validación min 4 caracteres, autofocus al seleccionar card
- Se envía como `payment_reference` al endpoint
- Banners de autorización:
  - > $5,000 → banner gerente
  - > $50,000 → banner dirección

### AdminShell — segregación de funciones

`NAV_ITEMS` ahora declara `roles: []` por ítem. `auxiliar_admin` pierde acceso a:
- Liquidaciones (era función de jefe de ruta/gerente)
- Materia prima (era función de almacenista/gerente)
- Validar materiales (era función del almacenista)

Solo `gerente_sucursal` ve esos tres. Helper `navItemsForRole(role)` exportado.

### ScreenMaterialesValidate

`ALLOWED_ROLES` reducido de `['auxiliar_admin', 'gerente_sucursal', 'gerente', 'supervisor']` a `['gerente_sucursal']`. Comentario explica segregación de funciones.

---

## Fase 4 — Rediseño por puesto (✅ COMPLETADO parcial)

### 4.1 Almacenista de entregas

Mejoras:
- `SessionErrorState` en `ScreenHubDia` y `ScreenRecibirPT` para errores de sesión
- `safeNumber` en merma, devoluciones, cierre
- Mantiene flujo actual de 7 pasos (ya era sólido)

### 4.2 Jefe de Ruta (VENDEDOR — aclarado)

- Header de `ScreenMiRutaV2.jsx` aclarado: este rol **ES VENDEDOR de una ruta**, no supervisor multi-ruta. Para supervisión multi-ruta usar `/equipo` del supervisor_ventas.
- Componente renombrado de `ScreenMiRuta` → `ScreenMiRutaV2` (export).
- `validateCorte` ahora bloquea cualquier diferencia.
- `company_id` hardcodeado removido de incidencias.

### 4.3 Supervisor de ventas

**Nuevos módulos** (con stubs marcados):

#### `ScreenTareasSupervisor.jsx` (`/equipo/tareas`)
- CRUD de tareas: asignar, prioridad, fecha, completar, cancelar
- Stats: pendientes / en curso / completadas
- Filtros por estado
- Banner visible "modo temporal — localStorage"

#### `ScreenNotasCliente.jsx` (`/equipo/notas`)
- Selector vendedor/cliente
- Lista de notas por sujeto
- Crear/eliminar nota
- Autor + timestamp

#### Servicios stub
- `src/modules/supervisor-ventas/tareasService.js`
- `src/modules/supervisor-ventas/notasService.js`

Ambos con flag `IS_STUB=true` y comentario TODO(backend) donde se conectarán los endpoints reales cuando existan.

`ScreenControlComercial` ahora incluye accesos rápidos a Tareas y Notas.

### 4.4 Auxiliar administrativo

- Banners de autorización en cierre de caja y POS (`<AuthBanner>`)
- NAV_ITEMS filtrado por rol (pierde acceso a funciones de otros roles)
- Folio obligatorio en pagos con tarjeta
- Nota obligatoria en cierre con diferencia > $100
- `AdminContext` sin hardcodes

---

## Fase 5 — UX y mobile (✅ COMPLETADO base)

### Componentes compartidos nuevos

| Archivo | Propósito |
|---------|-----------|
| `src/components/Toast.jsx` | `ToastProvider` + `useToast()`. Success/error/warning/info con auto-dismiss. Envuelve toda la app en `App.jsx`. |
| `src/components/Loader.jsx` | `<Loader />`, `<EmptyState />`, `<ErrorState />` consistentes. |
| `src/components/SessionErrorState.jsx` | Pantalla de error cuando falta contexto de sesión. |
| `src/components/AuthBanner.jsx` | Banner visual de "requiere autorización" con 3 niveles. |
| `src/components/PhotoCapture.jsx` | Componente para adjuntar foto — placeholder hoy (base64 inline), listo para migrar a endpoint `/pwa/evidence/upload`. |

`App.jsx` ahora envuelve todo en `<ToastProvider>`.

---

## Fase 6 — Refactor técnico (parcial, prudente)

No se hicieron refactors grandes para no romper estabilidad. Los cambios se limitaron a:
- Helpers centralizados (safeNumber, sessionGuards)
- Componentes UI compartidos
- Eliminar código muerto

Pendiente (fuera del scope de este sprint):
- Dividir componentes > 500 líneas
- Migrar servicios a TypeScript
- Tests e2e

---

## Fase 7 — Preparación para integración backend (✅ COMPLETADO)

### `BACKEND_TODO.md` creado

Lista completa de endpoints pendientes, con prioridad, payload esperado, y dónde se conectarán. Organizado por severidad:

- 🔴 Crítico (3 áreas): cash-closing/authorize, sale/payment_reference, ruta/corte + liquidacion persistentes
- 🟠 Alto (4 áreas): tareas, notas, day-sales, evidence upload
- 🟡 Medio (3 áreas): reject pallet log, customer search, team incidents
- 🟢 Bajo (2 áreas): capabilities extendidos, reapertura de cierre

### Patrón stub-adapter

Los servicios nuevos (`tareasService`, `notasService`) exportan `isStubMode()`. Cuando backend esté disponible, solo se cambia `IS_STUB = false` y se descomentan los `api()` calls. Las firmas permanecen iguales — las pantallas no se tocan.

---

## Lo que NO se hizo (y por qué)

- **Reapertura de cierre de caja**: requiere flujo de aprobación backend. Dejado como TODO.
- **Endpoint de evidencia centralizado**: el `PhotoCapture` funciona con base64 inline; cuando haya endpoint, se reemplaza en un solo lugar.
- **Tests automatizados**: fuera del scope; se recomienda agregar Playwright en próximo sprint.
- **Refactor de componentes > 500 líneas**: riesgo alto, beneficio medio; dejar para después de productivo.
- **Migración a TypeScript**: no es prerequisito de productivo.
- **Impresión real de ticket**: requiere discusión con negocio (PDF vs. print nativo vs. impresora térmica). Documentado como TODO.

---

## Build status

```
✓ built in 7.12s
0 errors
2 warnings pre-existentes (JSX chars en ScreenReconciliacionPT y ScreenEnergia — NO relacionados con este sprint)
```

## Archivos tocados (resumen)

**Creados (13)**:
- `src/lib/safeNumber.js`
- `src/lib/sessionGuards.js`
- `src/components/Toast.jsx`
- `src/components/Loader.jsx`
- `src/components/SessionErrorState.jsx`
- `src/components/AuthBanner.jsx`
- `src/components/PhotoCapture.jsx`
- `src/modules/supervisor-ventas/ScreenTareasSupervisor.jsx`
- `src/modules/supervisor-ventas/ScreenNotasCliente.jsx`
- `src/modules/supervisor-ventas/tareasService.js`
- `src/modules/supervisor-ventas/notasService.js`
- `BACKEND_TODO.md`
- `CHANGES.md` (este archivo)

**Modificados (14)**:
- `src/App.jsx`
- `src/modules/admin/AdminContext.jsx`
- `src/modules/admin/components/AdminShell.jsx`
- `src/modules/admin/forms/AdminCierreForm.jsx`
- `src/modules/admin/forms/AdminPosForm.jsx`
- `src/modules/admin/ScreenMaterialesValidate.jsx`
- `src/modules/entregas/ScreenHubDia.jsx`
- `src/modules/entregas/ScreenRecibirPT.jsx`
- `src/modules/entregas/ScreenCargaUnidades.jsx`
- `src/modules/entregas/ScreenCierreTurno.jsx`
- `src/modules/entregas/ScreenDevolucionesV2.jsx`
- `src/modules/entregas/ScreenMerma.jsx`
- `src/modules/entregas/ScreenOperacionDia.jsx`
- `src/modules/ruta/ScreenMiRutaV2.jsx`
- `src/modules/ruta/ScreenIncidencias.jsx`
- `src/modules/ruta/routeControlService.js`
- `src/modules/supervisor-ventas/ScreenControlComercial.jsx`

**Eliminados (8)**: ver sección Fase 1.

---

## Riesgos restantes antes de productivo

1. **Backend debe validar los umbrales que hoy solo valida la UI.**
   UI bloquea cierre > $100 sin nota, pero si alguien llama directo al endpoint con API, el backend debería rechazarlo también.

2. **Stubs de tareas/notas en localStorage.**
   Las tareas del supervisor NO se sincronizan entre dispositivos. Banner visible "modo temporal" para no confundir al usuario. Migrar cuando backend exponga endpoints (ver `BACKEND_TODO.md`).

3. **`PhotoCapture` envía base64 inline.**
   Funcional pero ineficiente. Migrar a `/pwa/evidence/upload` cuando esté disponible.

4. **Corte/Liquidación de ruta aún guarda en localStorage.**
   Si el vendedor cierra la app antes del cierre final, pierde el estado local. Persistir en backend (ver `BACKEND_TODO.md #3`).

5. **Rechazo de pallets no registra responsable.**
   Trazabilidad parcial. Backend debe añadir `rejected_by_id`, `rejected_at`, `reject_reason`.

6. **Desktop-only screens** (`ScreenLiquidaciones`, `ScreenMateriaPrima`):
   Tienen aviso "usa desktop" pero limita la movilidad. Mobile view pendiente de diseño.
