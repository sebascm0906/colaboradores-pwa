# Supervisor Ventas - Planeacion por Ruta con CEDIS Automatico

## Contexto

La pantalla actual de `Supervisor de Ventas > Pronostico` permite capturar productos para manana y opcionalmente asociarlos a un vendedor. Ese flujo no le da a la supervisora una vista operativa de las rutas maestras que ya existen en Odoo.

El flujo deseado es que la supervisora visualice las rutas `gf.route` que ya tienen empleado asignado, filtradas automaticamente por el CEDIS de su sesion, y desde ahi cree o actualice los planes diarios `gf.route.plan` para manana. Esos planes deben llegar al almacenista de entregas en la vista actual de `Cargar Unidades`, que ya trabaja con bloques por ruta/unidad y filtra por `route_id.warehouse_dispatch_id`.

## Decision Aprobada

- `Pronostico` se convierte en una planeacion por ruta.
- El CEDIS no se selecciona manualmente: se toma de `session.warehouse_id`.
- La fuente de rutas disponibles es `gf.route`, no solo `hr.employee`.
- Solo se muestran rutas con empleado/vendedor asignado.
- La salida operacional es un `gf.route.plan` por ruta y fecha objetivo.
- La fecha objetivo por defecto es manana.
- La vista del almacenista de entregas se conserva como destino principal: bloques por unidad/ruta, detalle de carga, stock CEDIS, editar lineas y confirmar carga.

## Flujo de Usuario

1. La supervisora entra a `/equipo/pronostico`.
2. La pantalla lee `session.warehouse_id` y `session.company_id`.
3. La pantalla consulta rutas maestras `gf.route` filtradas por:
   - `warehouse_dispatch_id = session.warehouse_id`
   - `company_id = session.company_id`, cuando aplique
   - ruta activa
   - empleado/vendedor asignado
4. La pantalla muestra tarjetas por ruta:
   - nombre de ruta
   - vendedor/empleado asignado
   - estado del plan de manana: sin plan, plan creado, forecast pendiente, forecast confirmado, carga disponible
5. La supervisora crea o reutiliza el plan diario para la ruta seleccionada.
6. La supervisora captura o ajusta forecast por ruta: producto, canal y cantidad.
7. Al confirmar, el backend debe dejar el plan y su carga listos para el almacenista.
8. El almacenista entra a `Cargar Unidades` y ve los mismos planes por ruta/unidad filtrados por su CEDIS.

## Arquitectura Frontend

### Pantalla

Modificar `src/modules/supervisor-ventas/ScreenPronostico.jsx` para que su primer nivel ya no sea "alcance por vendedor/global", sino "rutas del CEDIS".

La pantalla tendra tres zonas:

- Resumen superior:
  - CEDIS desde sesion
  - fecha objetivo, manana por defecto
  - conteo de rutas con plan y sin plan
- Lista de rutas:
  - una tarjeta por `gf.route`
  - CTA primario segun estado: `Crear plan`, `Editar forecast`, `Confirmar`, `Ver carga`
- Editor de forecast:
  - asociado a una ruta/plan
  - conserva el selector de productos y lineas actual
  - elimina el selector de vendedor como decision primaria

### API cliente

Agregar funciones en `src/modules/supervisor-ventas/api.js`:

- `getRouteTemplatesForPlanning(dateTarget?)`
  - GET `/pwa-supv/route-templates?date_target=YYYY-MM-DD`
  - no manda `warehouse_id`; el BFF lo toma de sesion
- `ensureDailyRoutePlan(routeId, dateTarget)`
  - POST `/pwa-supv/route-plan-ensure`
  - crea o reutiliza el plan por `route_id + date`
- `upsertRouteForecast(planId, lines)`
  - POST compatible con el backend de forecast actual, idealmente pasando `route_plan_id` o `route_id`

## Arquitectura BFF

Agregar handlers en `src/lib/api.js` dentro de `directSupervisorVentas()`:

### `GET /pwa-supv/route-templates`

Responsabilidad:

- Resolver `warehouseId = getWarehouseId()`.
- Rechazar con error accionable si no hay `warehouse_id` en sesion.
- Consultar `gf.route` con dominio:
  - `warehouse_dispatch_id = warehouseId`
  - `company_id = getCompanyId()` cuando exista
  - activa, si el modelo expone `active`
  - empleado/vendedor asignado, usando los campos reales disponibles en `gf.route`
- Enriquecer cada ruta con el plan existente para `date_target`:
  - `gf.route.plan` donde `route_id = route.id` y `date = date_target`
  - traer `state`, `load_picking_id`, `load_sealed`, chofer/vendedor y conteo de paradas

Respuesta normalizada:

```json
[
  {
    "route_id": 10,
    "route_name": "Ruta 01",
    "warehouse_id": 89,
    "employee_id": 123,
    "employee_name": "Vendedor",
    "plan_id": 321,
    "plan_state": "draft",
    "load_picking_id": 456,
    "load_sealed": false,
    "date_target": "2026-05-02"
  }
]
```

### `POST /pwa-supv/route-plan-ensure`

Responsabilidad:

- Validar que la ruta pertenece al CEDIS de sesion.
- Crear o reutilizar `gf.route.plan` para `route_id + date_target`.
- Ser idempotente: no duplicar planes si ya existen.
- Idealmente delegar al controller backend real de `gf_saleops` o `gf_logistics_ops` cuando exista.

Contrato esperado:

```json
{
  "ok": true,
  "plan_id": 321,
  "route_id": 10,
  "date_target": "2026-05-02",
  "created": false
}
```

## Backend/Odoo

La creacion real de planes y carga debe vivir en backend, no depender de escritura generica fragil desde la PWA. El BFF puede envolver el endpoint real, pero la autoridad debe validar:

- empleado autenticado es Supervisor de Ventas
- `route.warehouse_dispatch_id == session.warehouse_id`
- `route.company_id == session.company_id`
- ruta tiene empleado asignado
- no se generan duplicados por `route_id + date`
- el forecast confirmado crea/actualiza el picking de carga que consume Entregas

Si el endpoint backend para asegurar planes no existe todavia, la implementacion frontend debe dejar claro el error: "No se pudo crear el plan diario; endpoint no disponible".

## Integracion con Entregas

No se rediseña `ScreenCargaUnidades.jsx`. Esa vista ya tiene las piezas correctas:

- lista planes de hoy y manana
- filtra por `route_id.warehouse_dispatch_id = warehouse_id`
- muestra bloques por unidad/ruta
- carga detalle del picking
- consulta stock en CEDIS
- permite editar lineas antes de confirmar
- ejecuta carga contra `/gf/salesops/warehouse/load/execute`

El cambio principal es que los planes que aparecen ahi deben venir de la planeacion por ruta de la supervisora.

## Estados

La tarjeta de ruta en Supervisor debe manejar estos estados:

- `sin_plan`: ruta maestra asignada, sin `gf.route.plan` para manana
- `plan_draft`: plan existe, forecast pendiente
- `forecast_confirmed`: forecast confirmado y carga generada
- `load_ready`: plan tiene `load_picking_id`
- `load_executed`: picking ejecutado o carga sellada
- `blocked`: ruta incompleta o endpoint no disponible

## Riesgos

- Campos reales de `gf.route`: hay que confirmar nombres para empleado asignado y estado activo antes de implementar escritura.
- Duplicidad de planes: debe resolverse server-side con idempotencia.
- Sesiones de supervisor sin `warehouse_id`: el flujo debe bloquear con mensaje accionable.
- Forecast global de sucursal: puede mantenerse como fallback futuro, pero no debe ser el camino principal.

## Pruebas

### Unitarias

- Normalizacion de rutas maestras con y sin plan existente.
- Resolucion de fecha manana.
- Bloqueo cuando falta `warehouse_id`.
- Estado de tarjeta segun `plan_id`, `forecast state`, `load_picking_id` y `load_sealed`.

### Manual QA

1. Login como Supervisora con `warehouse_id`.
2. Abrir `/equipo/pronostico`.
3. Confirmar que solo aparecen rutas del CEDIS de sesion.
4. Confirmar que rutas sin empleado no aparecen o salen bloqueadas, segun decision final.
5. Crear plan para una ruta sin plan.
6. Capturar forecast por ruta y confirmar.
7. Login como Almacenista Entregas del mismo CEDIS.
8. Abrir `Cargar Unidades`.
9. Ver la ruta como bloque por unidad/ruta con detalle de carga.
10. Confirmar stock y ejecutar carga.

## Fuera de Alcance

- Selector manual de CEDIS.
- Redisenar la pantalla de Cargar Unidades.
- Cambiar el flujo de cierre/liquidacion de ruta.
- Permitir que una supervisora cree rutas maestras `gf.route`; eso debe seguir siendo configuracion de Odoo.
