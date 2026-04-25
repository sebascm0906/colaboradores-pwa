# Handoff Corto para Sebastián Backend: Endpoints Faltantes de Jefe de Ruta

## Qué hay que resolver
La PWA de `jefe_ruta` / `vendedor` ya intenta usar estos endpoints y hoy hay cuatro huecos operativos:
- checklist de unidad (`vehicle-*`)
- aceptar carga
- confirmar liquidación con persistencia real
- validar corte en backend, no en `localStorage`

## Regla transversal obligatoria
En todos los endpoints:
- resolver empleado autenticado desde sesión/token
- no confiar en `employee_id`, `company_id` o `warehouse_id` enviados por frontend
- validar que el `gf.route.plan` pertenece al empleado autenticado:
  - `driver_employee_id == employee_id_session` o
  - `salesperson_employee_id == employee_id_session`
- validar tenancy:
  - `plan.company_id == session.company_id`
  - `plan.route_id.warehouse_dispatch_id == session.warehouse_id`

Si falla ownership o tenancy:

```json
{
  "success": false,
  "code": "forbidden_plan_access",
  "message": "El plan no pertenece al empleado autenticado"
}
```

## Prioridad 1: Aceptar carga

### Endpoint
- `POST /pwa-ruta/accept-load`

### Request

```json
{
  "route_plan_id": 321
}
```

### Comportamiento requerido
- validar ownership del `route_plan_id`
- validar que el plan tenga `load_picking_id`
- reutilizar si es posible la lógica ya existente de `POST /gf/logistics/api/employee/route_plan/seal_load`
- persistir:
  - `load_sealed = true`
  - `load_sealed_at`
  - `load_sealed_by_id`
- devolver estado actualizado
- no permitir aceptar carga de otra ruta ni de otra sucursal

### Response esperada

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

### Errores esperados
- `400 route_plan_id_required`
- `403 forbidden_plan_access`
- `404 route_plan_not_found`
- `409 no_load_picking`
- `409 load_already_accepted`
- `409 picking_not_ready`

### Criterio de aceptación
- si el plan sí es del empleado, responde `success:true` y al releer `my-plan` / `my-load` ya sale `load_sealed=true`
- si el plan no es del empleado, responde `403`

## Prioridad 2: Liquidación persistente

### Endpoint
- `POST /gf/logistics/api/employee/liquidacion/confirm`

### Request

```json
{
  "plan_id": 321,
  "notes": "Faltaron 200 por ticket en revisión",
  "force": false
}
```

### Comportamiento requerido
- validar ownership del plan
- recalcular `total_expected`, `total_collected` y `difference` en backend
- persistir confirmación real de liquidación
- devolver `ok:true` solo si realmente se escribió y se puede releer
- no depender nunca de `localStorage`
- si hay diferencia y `force=false`, devolver warning funcional, no falso éxito
- si `force=true`, guardar trazabilidad real del override

### Response de éxito

```json
{
  "ok": true,
  "message": "Liquidación confirmada",
  "data": {
    "plan_id": 321,
    "liquidacion_confirmed": true,
    "liquidacion_confirmed_at": "2026-04-25T18:40:00Z",
    "liquidacion_confirmed_by_id": 45,
    "total_expected": 4200.0,
    "total_collected": 4200.0,
    "difference": 0.0
  }
}
```

### Response de warning

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

### Response de fallo real

```json
{
  "ok": false,
  "code": "write_failed",
  "message": "No se pudo persistir la confirmación"
}
```

### Campos a persistir
En `gf.route.plan` o modelo equivalente vinculado al plan:
- `liquidacion_done_at`
- `liquidacion_done_by_id`
- `liquidacion_notes`
- `liquidacion_difference`
- `liquidacion_force`

### Criterio de aceptación
- si se confirma correctamente, el backend lo puede releer después del write
- si falla el write, no regresa `ok:true`
- si el plan es ajeno, responde `403`

## Prioridad 3: Corte real en backend

### Endpoint nuevo
- `POST /pwa-ruta/validate-corte`

### Request

```json
{
  "plan_id": 321,
  "client_validation": {
    "valid": true
  },
  "notes": ""
}
```

### Comportamiento requerido
- validar ownership del plan
- recalcular corte en backend
- usar `gf.dispatch.reconciliation` como fuente principal
- no confiar ciegamente en `client_validation`
- setear `gf.route.plan.corte_validated=true` solo si backend valida que cuadra
- setear `corte_validated_at`
- idealmente también `corte_validated_by_id`

### Response de éxito

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

### Response de rechazo

```json
{
  "success": false,
  "code": "corte_validation_failed",
  "message": "El corte no cuadra a cero",
  "details": {
    "plan_id": 321,
    "errors": [
      "Diferencia total: +5 unidades"
    ]
  }
}
```

### Criterio de aceptación
- si el backend valida corte correcto, al releer `my-plan` ya aparece `corte_validated=true`
- si no cuadra, no debe marcar el plan como validado
- si el plan no pertenece al empleado, responde `403`

## Prioridad 4: Checklist de unidad

### Endpoints que hoy usa la UI
- `GET /pwa-ruta/vehicle-checklist?route_plan_id=ID`
- `POST /pwa-ruta/vehicle-check`
- `POST /pwa-ruta/vehicle-checklist-complete`
- `POST /pwa-ruta/vehicle-checklist-create`
- `POST /pwa-ruta/vehicle-checklist-init`
- `GET /pwa-ruta/vehicle-checks?checklist_id=ID`

### Contrato mínimo requerido

#### `GET /pwa-ruta/vehicle-checklist?route_plan_id=321`
Si existe:

```json
{
  "id": 88,
  "route_plan_id": 321,
  "shift_id": 901,
  "state": "pending",
  "all_passed": false,
  "check_ids": [1001, 1002, 1003]
}
```

Si aún no existe:

```json
null
```

No responder `404` en el caso “no existe checklist todavía”, porque el frontend usa `null` para autocrearlo.

#### `POST /pwa-ruta/vehicle-checklist-create`
Request:

```json
{
  "employee_id": 45
}
```

Response mínima:

```json
{
  "shift_id": 901,
  "route_plan_id": 321
}
```

#### `POST /pwa-ruta/vehicle-checklist-init`
Request:

```json
{
  "shift_id": 901,
  "employee_id": 45
}
```

Response mínima:

```json
{
  "checklist_id": 88,
  "state": "pending"
}
```

#### `GET /pwa-ruta/vehicle-checks?checklist_id=88`
Response mínima:

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
  }
]
```

#### `POST /pwa-ruta/vehicle-check`
Request posibles:

```json
{
  "check_id": 1001,
  "result_bool": true
}
```

```json
{
  "check_id": 1002,
  "result_numeric": 104523
}
```

```json
{
  "check_id": 1003,
  "result_photo": "data:image/jpeg;base64,/9j/4AAQSk..."
}
```

Response recomendada:

```json
{
  "success": true,
  "data": {
    "check_id": 1001,
    "checklist_id": 88,
    "passed": true,
    "updated_at": "2026-04-25T10:15:00Z"
  }
}
```

#### `POST /pwa-ruta/vehicle-checklist-complete`
Request:

```json
{
  "checklist_id": 88
}
```

Response recomendada:

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

### Reglas mínimas
- todos los `checklist_id` y `check_id` deben resolverse hasta su `route_plan_id` padre
- validar ownership desde el plan, no solo por ID directo del check
- para `vehicle-check`, aceptar `false` como respuesta válida en `result_bool`
- para `numeric`, validar rango
- para `photo`, validar tamaño/tipo
- para `complete`, no completar si faltan checks obligatorios

### Modelos
Confirmado en el repo:
- `gf.route.plan`

No confirmados en este repo, pero necesarios o equivalentes:
- `gf.vehicle.checklist`
- `gf.vehicle.check`
- `gf.vehicle.check.template`

## Modelos/campos que sí o sí deben existir o agregarse

### `gf.route.plan`
Ya existe en frontend:
- `load_sealed`
- `corte_validated`
- `corte_validated_at`

Agregar o confirmar:
- `load_sealed_at`
- `load_sealed_by_id`
- `corte_validated_by_id`
- `liquidacion_done_at`
- `liquidacion_done_by_id`
- `liquidacion_notes`
- `liquidacion_difference`
- `liquidacion_force`

### `gf.dispatch.reconciliation`
Necesario para corte:
- `route_plan_id`
- `state`
- `line_ids`
- `qty_loaded`
- `qty_delivered`
- `qty_returned`
- `qty_scrap`
- `qty_difference`

## Riesgos si se implementa mal
- aceptar `employee_id` del frontend como fuente de verdad
- permitir operar un `plan_id` ajeno
- confiar en corte calculado por frontend
- devolver éxito de liquidación sin write real
- no releer el estado después de persistir
- marcar `load_sealed` o `corte_validated` sin validar sucursal/ownership

## Orden final recomendado
1. `POST /pwa-ruta/accept-load`
2. `POST /gf/logistics/api/employee/liquidacion/confirm`
3. `POST /pwa-ruta/validate-corte`
4. bundle completo `vehicle-*`

## Documento largo de referencia
Si Sebastián necesita detalle completo:
- [2026-04-25-jefe-ruta-endpoints-faltantes-design.md](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/docs/superpowers/specs/2026-04-25-jefe-ruta-endpoints-faltantes-design.md)
