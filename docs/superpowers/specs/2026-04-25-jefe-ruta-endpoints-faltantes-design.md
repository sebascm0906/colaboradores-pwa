# Endpoints Faltantes de Jefe de Ruta / Vendedor para Sebastián Backend

## Contexto
La PWA de `jefe_ruta` / `vendedor` ya consume endpoints para inicio de día, corte y liquidación, pero hoy parte del flujo sigue fallando con `404` o depende de `localStorage`.

Las fuentes confirmadas en este repo son:
- `src/modules/ruta/api.js`: lista exacta de endpoints que intenta usar la UI.
- `src/modules/ruta/ScreenChecklistUnidad.jsx`: shape esperado para checklist y checks.
- `src/modules/ruta/ScreenAceptarCarga.jsx`: shape esperado para aceptación de carga.
- `src/modules/ruta/ScreenLiquidacion.jsx`: contrato ya asumido por la UI para `POST /gf/logistics/api/employee/liquidacion/confirm`.
- `src/modules/ruta/ScreenCorteRuta.jsx` y `src/modules/ruta/routeControlService.js`: validación actual de corte y dependencia de `localStorage`.
- `src/lib/api.js`: campos confirmados de `gf.route.plan`, `gf.dispatch.reconciliation`, `stock.move` y el endpoint backend ya existente `POST /gf/logistics/api/employee/route_plan/seal_load`.

## Objetivo
Dejar una especificación backend compatible con la UI actual, eliminando dependencias críticas de `localStorage` y endureciendo ownership/tenancy para que un empleado no pueda operar rutas, liquidaciones o cortes fuera de su propio plan.

## Criterios de Compatibilidad
- Mantener los paths que hoy usa el frontend para evitar cambios innecesarios en la PWA.
- No confiar en `employee_id`, `company_id` o `warehouse_id` enviados por query/body.
- Resolver siempre el empleado autenticado desde sesión/token.
- Para `gf.route.plan`, permitir acceso solo si el empleado autenticado es `driver_employee_id` o `salesperson_employee_id`.
- Además del ownership del plan, validar tenancy:
  - `gf.route.plan.company_id == session.company_id`
  - `gf.route.plan.route_id.warehouse_dispatch_id == session.warehouse_id`
- En subregistros como checklist, checks y reconciliación, validar acceso a través del `route_plan_id` padre, no solo por ID directo del subregistro.

## Modelos Confirmados vs Inferidos

### Confirmados en el repo
- `gf.route.plan`
  - campos confirmados: `id`, `name`, `date`, `route_id`, `state`, `driver_employee_id`, `salesperson_employee_id`, `load_picking_id`, `load_sealed`, `reconciliation_id`, `departure_km`, `arrival_km`, `corte_validated`, `corte_validated_at`, `closure_time`
- `gf.dispatch.reconciliation`
  - campos confirmados: `id`, `route_plan_id`, `state`, `total_expected`, `total_received`, `difference`, `line_ids`
  - el frontend además asume agregados tipo `qty_loaded`, `qty_delivered`, `qty_returned`, `qty_scrap`, `qty_difference`
- `stock.picking`
  - usado como `load_picking_id` de la ruta
- `stock.move`
  - usado para `/pwa-ruta/load-lines`

### Inferidos o propuestos para checklist de unidad
El repo confirma el contrato HTTP del checklist, pero no expone los modelos Odoo reales de esa pieza. Por eso aquí la nomenclatura de modelos es propuesta, no confirmada.

Propuesta mínima:
- `gf.vehicle.checklist`
- `gf.vehicle.check`
- `gf.vehicle.check.template`
- opcional: `gf.vehicle.checklist.shift` o equivalente si backend quiere conservar el paso intermedio `create -> init`

Si Sebastián ya tiene modelos equivalentes con otros nombres, el contrato HTTP importa más que el naming interno.

## Contrato de Error Recomendado

### Para endpoints nuevos de `/pwa-ruta/*`
Usar error estructurado:

```json
{
  "success": false,
  "code": "forbidden_plan_access",
  "message": "El plan no pertenece al empleado autenticado",
  "details": {
    "plan_id": 321
  }
}
```

### Para `POST /gf/logistics/api/employee/liquidacion/confirm`
Mantener el contrato que ya espera la UI:
- warning funcional: HTTP 200 con `ok: false`
- error de negocio o persistencia: HTTP 200 con `ok: false`
- excepciones reales de infraestructura: HTTP 4xx/5xx o JSON-RPC error

Ejemplo:

```json
{
  "ok": false,
  "code": "difference_warning",
  "message": "La liquidación tiene diferencia",
  "data": {
    "plan_id": 321,
    "total_expected": 4200.0,
    "total_collected": 4000.0,
    "difference": -200.0
  }
}
```

## 1. Checklist Unidad

### Resumen de endpoints `vehicle-*` usados por la UI
- `GET /pwa-ruta/vehicle-checklist?route_plan_id=ID`
- `POST /pwa-ruta/vehicle-check`
- `POST /pwa-ruta/vehicle-checklist-complete`
- `POST /pwa-ruta/vehicle-checklist-create`
- `POST /pwa-ruta/vehicle-checklist-init`
- `GET /pwa-ruta/vehicle-checks?checklist_id=ID`

### Regla común de ownership para checklist
- Resolver el `route_plan_id` objetivo.
- Validar que el plan pertenece al empleado autenticado.
- Validar company y warehouse del plan contra sesión.
- Si el checklist/check apunta a otro plan o a otro empleado, devolver `403`.

### 1.1 `GET /pwa-ruta/vehicle-checklist?route_plan_id=ID`

**Método**
- `GET`

**URL**
- `/pwa-ruta/vehicle-checklist?route_plan_id=321`

**Payload esperado por frontend**
- Query param obligatorio: `route_plan_id`

**Response esperada por frontend**
- Para compatibilidad, debe devolver objeto plano o `null`.
- No conviene envolver en `data`, porque la pantalla actual usa `const data = await getVehicleChecklist(...)`.

Ejemplo cuando existe:

```json
{
  "id": 88,
  "route_plan_id": 321,
  "shift_id": 901,
  "state": "pending",
  "all_passed": false,
  "completed_at": null,
  "check_ids": [1001, 1002, 1003]
}
```

Ejemplo cuando no existe todavía:

```json
null
```

**Campos obligatorios**
- `route_plan_id`

**Validaciones de ownership/tenancy**
- El `route_plan_id` debe pertenecer al empleado autenticado.
- No aceptar un checklist de otra ruta aunque el usuario conozca el ID.
- Validar `company_id` y `route_id.warehouse_dispatch_id` contra la sesión.

**Modelos Odoo involucrados**
- Confirmado: `gf.route.plan`
- Inferido/propuesto: `gf.vehicle.checklist`

**Errores esperados**
- `400 invalid_route_plan_id`
- `403 forbidden_plan_access`
- `404 route_plan_not_found`
- `409 duplicated_active_checklist` si backend detecta más de un checklist activo para el mismo plan

**Notas de compatibilidad**
- Si el plan existe y pertenece al empleado pero aún no hay checklist, responder `200 null`, no `404`. La UI usa ese `null` para disparar `vehicle-checklist-create` + `vehicle-checklist-init`.

### 1.2 `POST /pwa-ruta/vehicle-checklist-create`

**Método**
- `POST`

**URL**
- `/pwa-ruta/vehicle-checklist-create`

**Payload esperado por frontend**

```json
{
  "employee_id": 45
}
```

**Response esperada por frontend**
- La UI actual solo necesita `shift_id`.

Ejemplo:

```json
{
  "shift_id": 901,
  "route_plan_id": 321
}
```

**Campos obligatorios**
- Ninguno del body debe ser fuente de verdad.
- Para compatibilidad, aceptar `employee_id`, pero backend debe ignorarlo o solo compararlo con sesión.

**Validaciones de ownership/tenancy**
- Resolver al empleado autenticado desde sesión.
- Encontrar su plan de ruta activo del día.
- No crear shift/checklist si no hay plan propio activo para ese empleado.

**Modelos Odoo involucrados**
- Confirmado: `gf.route.plan`
- Inferido/propuesto:
  - `gf.vehicle.checklist.shift` o equivalente
  - `gf.vehicle.checklist`

**Errores esperados**
- `401 no_session`
- `404 no_active_route_plan`
- `403 employee_mismatch` si se manda `employee_id` distinto al de sesión
- `409 shift_already_exists` si backend decide no hacerlo idempotente

**Diseño recomendado**
- Hacer este endpoint idempotente por `route_plan_id + employee_id + date`.
- Si ya existe un shift vigente, devolver el mismo `shift_id`.

### 1.3 `POST /pwa-ruta/vehicle-checklist-init`

**Método**
- `POST`

**URL**
- `/pwa-ruta/vehicle-checklist-init`

**Payload esperado por frontend**

```json
{
  "shift_id": 901,
  "employee_id": 45
}
```

**Response esperada por frontend**
- La UI actual solo necesita `checklist_id`.

Ejemplo:

```json
{
  "checklist_id": 88,
  "state": "pending",
  "created_checks": 12
}
```

**Campos obligatorios**
- `shift_id`

**Validaciones de ownership/tenancy**
- `shift_id` debe pertenecer al plan del empleado autenticado.
- Si el body trae `employee_id`, debe coincidir con sesión.
- No inicializar checks para shifts de otra ruta/sucursal.

**Modelos Odoo involucrados**
- Inferido/propuesto:
  - `gf.vehicle.checklist.shift`
  - `gf.vehicle.checklist`
  - `gf.vehicle.check`
  - `gf.vehicle.check.template`

**Errores esperados**
- `400 shift_id_required`
- `403 forbidden_shift_access`
- `404 shift_not_found`
- `409 checklist_already_initialized` si backend no hace idempotencia
- `422 missing_vehicle_template` si no existe template para la ruta/warehouse/unidad

**Diseño recomendado**
- Hacer este endpoint idempotente.
- Si el checklist ya existe, devolver el mismo `checklist_id`.

### 1.4 `GET /pwa-ruta/vehicle-checks?checklist_id=ID`

**Método**
- `GET`

**URL**
- `/pwa-ruta/vehicle-checks?checklist_id=88`

**Payload esperado por frontend**
- Query param obligatorio: `checklist_id`

**Response esperada por frontend**
- La UI espera un array plano.

Ejemplo:

```json
[
  {
    "id": 1001,
    "checklist_id": 88,
    "name": "Nivel de aceite",
    "check_type": "yes_no",
    "min_value": null,
    "max_value": null,
    "result_bool": true,
    "result_numeric": null,
    "result_photo": null,
    "passed": true,
    "sequence": 1
  },
  {
    "id": 1002,
    "checklist_id": 88,
    "name": "Odómetro inicial",
    "check_type": "numeric",
    "min_value": 0,
    "max_value": 999999,
    "result_bool": null,
    "result_numeric": 104523,
    "result_photo": null,
    "passed": true,
    "sequence": 2
  },
  {
    "id": 1003,
    "checklist_id": 88,
    "name": "Foto frontal",
    "check_type": "photo",
    "min_value": null,
    "max_value": null,
    "result_bool": null,
    "result_numeric": null,
    "result_photo": "https://odoo.example.com/web/content/ir.attachment/555/datas",
    "passed": true,
    "sequence": 3
  }
]
```

**Campos obligatorios**
- `checklist_id`

**Validaciones de ownership/tenancy**
- El checklist debe colgar de un plan propio del empleado autenticado.

**Modelos Odoo involucrados**
- Inferido/propuesto:
  - `gf.vehicle.checklist`
  - `gf.vehicle.check`

**Errores esperados**
- `400 checklist_id_required`
- `403 forbidden_checklist_access`
- `404 checklist_not_found`

**Notas de compatibilidad**
- El frontend hoy usa `passed` como si significara “respuesta guardada”, no necesariamente “pasó inspección”.
- Si backend usa `passed=false` para un `yes_no` negativo, al recargar la UI actual puede tratarlo como no respondido.
- Recomendación: devolver también `answered: true` y ajustar frontend cuando se toque esa pantalla.

### 1.5 `POST /pwa-ruta/vehicle-check`

**Método**
- `POST`

**URL**
- `/pwa-ruta/vehicle-check`

**Payload esperado por frontend**

Ejemplo boolean:

```json
{
  "check_id": 1001,
  "result_bool": true
}
```

Ejemplo numérico:

```json
{
  "check_id": 1002,
  "result_numeric": 104523
}
```

Ejemplo foto:

```json
{
  "check_id": 1003,
  "result_photo": "data:image/jpeg;base64,/9j/4AAQSk..."
}
```

**Response esperada por frontend**
- La UI no inspecciona hoy el body, pero backend debe devolver el check actualizado para consistencia.

Ejemplo:

```json
{
  "success": true,
  "data": {
    "check_id": 1002,
    "checklist_id": 88,
    "passed": true,
    "result_bool": null,
    "result_numeric": 104523,
    "result_photo": null,
    "updated_at": "2026-04-25T10:15:00Z"
  }
}
```

**Campos obligatorios**
- `check_id`
- uno y solo uno entre `result_bool`, `result_numeric`, `result_photo`

**Validaciones de ownership/tenancy**
- El `check_id` debe pertenecer a un checklist del plan propio del empleado autenticado.
- No permitir actualizar checks de otro checklist/otra ruta.

**Modelos Odoo involucrados**
- Inferido/propuesto:
  - `gf.vehicle.check`
  - `gf.vehicle.checklist`
  - `ir.attachment` si la foto se normaliza como attachment en vez de base64 inline

**Errores esperados**
- `400 check_id_required`
- `400 invalid_payload_shape`
- `403 forbidden_check_access`
- `404 check_not_found`
- `422 numeric_out_of_range`
- `413 photo_too_large`
- `415 unsupported_photo_type`

**Validaciones funcionales**
- `numeric`: validar rango `min_value <= result_numeric <= max_value` cuando aplique.
- `photo`: validar MIME, tamaño máximo y convertir a attachment/URL segura.
- `yes_no`: permitir `false` como respuesta válida, no tratarlo como ausencia.

### 1.6 `POST /pwa-ruta/vehicle-checklist-complete`

**Método**
- `POST`

**URL**
- `/pwa-ruta/vehicle-checklist-complete`

**Payload esperado por frontend**

```json
{
  "checklist_id": 88
}
```

**Response esperada por frontend**
- La UI hoy solo necesita que responda 2xx, pero backend debe regresar estado final.

Ejemplo:

```json
{
  "success": true,
  "data": {
    "checklist_id": 88,
    "state": "completed",
    "completed_at": "2026-04-25T10:20:00Z",
    "all_passed": true
  }
}
```

**Campos obligatorios**
- `checklist_id`

**Validaciones de ownership/tenancy**
- El checklist debe pertenecer al plan del empleado autenticado.
- No completar checklist de otro empleado o de otra sucursal.

**Modelos Odoo involucrados**
- Inferido/propuesto:
  - `gf.vehicle.checklist`
  - `gf.vehicle.check`

**Errores esperados**
- `400 checklist_id_required`
- `403 forbidden_checklist_access`
- `404 checklist_not_found`
- `409 checklist_incomplete` si faltan checks obligatorios
- `409 checklist_already_completed`

**Validaciones funcionales**
- Antes de marcar `completed`, validar que todos los checks requeridos tienen respuesta persistida.

## 2. Aceptar Carga

### 2.1 `POST /pwa-ruta/accept-load`

**Método**
- `POST`

**URL**
- `/pwa-ruta/accept-load`

**Payload esperado por frontend**

```json
{
  "route_plan_id": 321
}
```

**Response esperada por frontend**
- El usuario pidió `success:true` con estado actualizado.
- Recomendación: mantener wrapper compatible y reutilizar la misma lógica transaccional que ya existe detrás de `POST /gf/logistics/api/employee/route_plan/seal_load`.

Ejemplo:

```json
{
  "success": true,
  "data": {
    "plan_id": 321,
    "state": "in_progress",
    "load_picking_id": 987,
    "load_sealed": true,
    "load_sealed_at": "2026-04-25T07:05:00Z",
    "picking_state": "done"
  }
}
```

**Campos obligatorios**
- `route_plan_id`

**Validaciones de ownership/tenancy**
- El `route_plan_id` debe pertenecer al empleado autenticado.
- `company_id` del plan debe coincidir con sesión.
- `route_id.warehouse_dispatch_id` del plan debe coincidir con `session.warehouse_id`.
- No permitir aceptar carga de otra ruta aunque sea del mismo warehouse.
- No permitir aceptar carga si el plan no tiene `load_picking_id`.

**Modelos Odoo involucrados**
- Confirmados:
  - `gf.route.plan`
  - `stock.picking`
  - `stock.move`
- Campos relevantes:
  - `gf.route.plan.load_picking_id`
  - `gf.route.plan.load_sealed`
  - inferido por comentarios existentes: `load_sealed_at`, `load_sealed_by_id`

**Errores esperados**
- `400 route_plan_id_required`
- `403 forbidden_plan_access`
- `404 route_plan_not_found`
- `409 no_load_picking`
- `409 load_already_accepted`
- `409 picking_not_ready`
- `409 invalid_plan_state`

**Diseño recomendado**
- Implementar este endpoint como alias o wrapper de la lógica real ya existente en `route_plan/seal_load`.
- La persistencia debe ser transaccional:
  - validar picking
  - marcar `load_sealed=true`
  - escribir `load_sealed_at`
  - escribir `load_sealed_by_id`
  - refrescar y devolver estado actualizado

## 3. Liquidación

### 3.1 `POST /gf/logistics/api/employee/liquidacion/confirm`

**Método**
- `POST`

**URL**
- `/gf/logistics/api/employee/liquidacion/confirm`

**Payload esperado por frontend**

```json
{
  "plan_id": 321,
  "notes": "Faltaron 200 por ticket en revisión",
  "force": false
}
```

**Response esperada por frontend**

Caso exitoso:

```json
{
  "ok": true,
  "message": "Liquidación confirmada",
  "data": {
    "plan_id": 321,
    "state": "in_progress",
    "liquidacion_confirmed": true,
    "liquidacion_confirmed_at": "2026-04-25T18:40:00Z",
    "liquidacion_confirmed_by_id": 45,
    "total_expected": 4200.0,
    "total_collected": 4200.0,
    "difference": 0.0
  }
}
```

Caso warning por diferencia:

```json
{
  "ok": false,
  "code": "difference_warning",
  "message": "La liquidación tiene diferencia",
  "data": {
    "plan_id": 321,
    "total_expected": 4200.0,
    "total_collected": 4000.0,
    "difference": -200.0
  }
}
```

Caso fallo estructurado:

```json
{
  "ok": false,
  "code": "write_failed",
  "message": "No se pudo persistir la confirmación",
  "data": {
    "plan_id": 321
  }
}
```

**Campos obligatorios**
- `plan_id`
- `force` opcional, default `false`
- `notes` opcional, pero recomendado obligatorio cuando `force=true` o cuando hay diferencia

**Validaciones de ownership/tenancy**
- `plan_id` debe pertenecer al empleado autenticado.
- Validar company/warehouse del plan contra sesión.
- No permitir confirmar liquidación de otro plan ni de otra sucursal.

**Modelos Odoo involucrados**
- Confirmados:
  - `gf.route.plan`
  - `gf.dispatch.reconciliation` o modelo de agregación de pagos de la ruta
- Campos confirmados/inferidos:
  - confirmados por frontend: `plan_id`, `state`
  - pendientes de persistir: `liquidacion_done_at`, `liquidacion_done_by_id`
  - recomendados adicionales: `liquidacion_difference`, `liquidacion_notes`, `liquidacion_force`

**Errores esperados**
- `400 plan_id_required`
- `403 forbidden_plan_access`
- `404 route_plan_not_found`
- `409 liquidation_not_ready`
- `409 difference_warning` como respuesta funcional cuando `force=false`
- `422 notes_required_for_force`
- `500 write_failed`

**Reglas de negocio**
- Backend debe recalcular `total_expected`, `total_collected` y `difference` usando datos reales del backend.
- Nunca depender de `localStorage`.
- `success/ok` solo debe ser `true` si:
  - el write en backend se ejecutó
  - y la confirmación persistida se pudo releer/verificar

**Persistencia mínima requerida**
- En `gf.route.plan`, o en modelo equivalente vinculado al plan:
  - marca de confirmación real
  - fecha/hora
  - empleado que confirmó
  - notas
  - diferencia calculada
  - indicador de override si se usó `force=true`

## 4. Corte

### 4.1 `POST /pwa-ruta/validate-corte`

**Método**
- `POST`

**URL**
- `/pwa-ruta/validate-corte`

**Payload esperado por frontend**
- Debe recibir `plan_id` y resultado de validación del cliente, pero el backend debe tratar ese resultado como informativo.

Ejemplo:

```json
{
  "plan_id": 321,
  "client_validation": {
    "valid": true,
    "totals": {
      "loaded": 120,
      "delivered": 120,
      "returned": 0,
      "scrap": 0,
      "difference": 0
    }
  },
  "notes": ""
}
```

**Response esperada por frontend**

Caso exitoso:

```json
{
  "success": true,
  "data": {
    "plan_id": 321,
    "corte_validated": true,
    "corte_validated_at": "2026-04-25T18:10:00Z",
    "totals": {
      "loaded": 120,
      "delivered": 120,
      "returned": 0,
      "scrap": 0,
      "difference": 0
    },
    "errors": [],
    "warnings": []
  }
}
```

Caso rechazo:

```json
{
  "success": false,
  "code": "corte_validation_failed",
  "message": "El corte no cuadra a cero",
  "details": {
    "plan_id": 321,
    "totals": {
      "loaded": 120,
      "delivered": 110,
      "returned": 5,
      "scrap": 0,
      "difference": 5
    },
    "errors": [
      "Diferencia total: +5 unidades"
    ]
  }
}
```

**Campos obligatorios**
- `plan_id`
- `client_validation` recomendado/compatibilidad, pero no debe ser fuente de verdad

**Validaciones de ownership/tenancy**
- `plan_id` debe pertenecer al empleado autenticado.
- Validar company/warehouse del plan contra sesión.
- No permitir validar corte de otra ruta/sucursal.

**Modelos Odoo involucrados**
- Confirmados:
  - `gf.route.plan`
  - `gf.dispatch.reconciliation`
  - `stock.move` como fallback de solo lectura
- Campos relevantes:
  - confirmados: `gf.route.plan.corte_validated`, `gf.route.plan.corte_validated_at`, `gf.route.plan.reconciliation_id`
  - recomendado adicional: `corte_validated_by_id`

**Errores esperados**
- `400 plan_id_required`
- `403 forbidden_plan_access`
- `404 route_plan_not_found`
- `409 reconciliation_not_ready`
- `409 corte_validation_failed`
- `500 write_failed`

**Reglas de negocio**
- Backend debe recalcular el corte desde fuentes canónicas.
- Prioridad de cálculo:
  1. `gf.dispatch.reconciliation` y sus líneas
  2. fallback de solo lectura a `stock.move` para informar carga, pero no para aprobar el corte si no existe conciliación suficiente
- No confiar ciegamente en `client_validation.valid`.
- Solo setear `corte_validated=true` si el recálculo backend pasa.
- Si no existe información suficiente para validar, responder error estructurado; no marcar el plan como válido.

## Lista Consolidada de Modelos y Campos Requeridos

### `gf.route.plan`
Campos ya confirmados:
- `id`
- `state`
- `driver_employee_id`
- `salesperson_employee_id`
- `route_id`
- `load_picking_id`
- `load_sealed`
- `reconciliation_id`
- `departure_km`
- `arrival_km`
- `corte_validated`
- `corte_validated_at`
- `closure_time`

Campos requeridos o altamente recomendados para cerrar gaps:
- `load_sealed_at`
- `load_sealed_by_id`
- `corte_validated_by_id`
- `liquidacion_done_at`
- `liquidacion_done_by_id`
- `liquidacion_notes`
- `liquidacion_difference`
- `liquidacion_force`

### `gf.dispatch.reconciliation`
Campos requeridos por la UI/servicio:
- `route_plan_id`
- `state`
- `line_ids`
- `qty_loaded`
- `qty_delivered`
- `qty_returned`
- `qty_scrap`
- `qty_difference`

### `stock.picking`
Campos requeridos para carga:
- `id`
- `state`
- `company_id`
- `move_ids_without_package` o equivalente

### `stock.move`
Campos requeridos para detalle de carga:
- `id`
- `picking_id`
- `product_id`
- `product_uom_qty`
- `quantity_done`
- `state`

### Checklist de unidad
Modelos propuestos:
- `gf.vehicle.checklist`
  - `route_plan_id`
  - `employee_id`
  - `shift_id`
  - `state`
  - `all_passed`
  - `completed_at`
  - `completed_by_id`
  - `check_ids`
- `gf.vehicle.check`
  - `checklist_id`
  - `template_id`
  - `name`
  - `sequence`
  - `check_type`
  - `min_value`
  - `max_value`
  - `result_bool`
  - `result_numeric`
  - `result_photo`
  - `passed`
- `gf.vehicle.check.template`
  - `name`
  - `sequence`
  - `check_type`
  - `min_value`
  - `max_value`
  - `requires_photo`
  - `company_id` o `warehouse_id` si aplica por sucursal

## Riesgos de Seguridad
- Confiar en `employee_id` del body permitiría operar checklist o crear contenedores para otro empleado.
- Confiar solo en `route_plan_id` sin validar ownership permitiría aceptar carga, validar corte o confirmar liquidación de otra ruta.
- Confiar solo en `company_id` sin validar `warehouse_dispatch_id` dejaría hueco de cross-sucursal.
- Confiar en `client_validation` del corte permitiría aprobar inventario falso desde frontend.
- Confirmar liquidación sin relectura posterior al write puede devolver éxito falso positivo.
- Permitir `force=true` sin nota obligatoria reduce trazabilidad de diferencias.
- Persistir fotos como base64 sin límites puede abrir abuso de tamaño, consumo de disco y payloads excesivos.
- Responder `404` cuando no existe checklist pero sí existe el plan rompería la lógica actual de autocreación del frontend.

## Orden Recomendado de Implementación

### 1. `POST /pwa-ruta/accept-load`
Es la pieza más rápida porque ya existe una lógica backend equivalente en `POST /gf/logistics/api/employee/route_plan/seal_load`. Conviene exponer wrapper compatible primero para cerrar el gap de inicio de día con mínimo riesgo.

### 2. `POST /gf/logistics/api/employee/liquidacion/confirm`
Es el gap más delicado por impacto operativo y financiero. Hoy la UI ya consume este endpoint, pero la confirmación debe persistir de verdad y no depender de `localStorage`.

### 3. `POST /pwa-ruta/validate-corte`
Permite sacar el corte de `localStorage` y usar `gf.route.plan.corte_validated`, que ya existe en el modelo leído por la PWA.

### 4. Bundle completo de checklist de unidad
Implementarlo como bloque único:
- `vehicle-checklist`
- `vehicle-checklist-create`
- `vehicle-checklist-init`
- `vehicle-checks`
- `vehicle-check`
- `vehicle-checklist-complete`

Este bloque es el más grande porque los modelos reales no están confirmados en este repo y probablemente requiere backend nuevo, templates y persistencia de evidencia.

## Recomendación Final
Si Sebastián quiere minimizar cambios en frontend:
- mantener `/pwa-ruta/accept-load` como wrapper del servicio real de sellado de carga
- mantener `POST /gf/logistics/api/employee/liquidacion/confirm` con el contrato `ok/code/data` ya asumido por la UI
- agregar `POST /pwa-ruta/validate-corte` y hacer que la PWA deje de marcar `corteDone` solo en `localStorage`
- para checklist, respetar los endpoints actuales aunque internamente se resuelvan con otro modelo o con un flujo más simple e idempotente

La única zona donde el contrato frontend hoy es débil es checklist: la UI actual mezcla “respondido” con `passed`. Conviene corregir eso en una iteración posterior, pero no bloquea que backend exponga los endpoints faltantes si mantiene compatibilidad razonable.
