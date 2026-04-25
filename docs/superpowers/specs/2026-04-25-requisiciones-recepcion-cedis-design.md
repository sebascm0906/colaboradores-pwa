# Recepción de Requisiciones por CEDIS con Tipo de Operación Automático

## Contexto
Hoy la PWA de administración de sucursal ya permite:
- crear requisiciones desde [src/modules/admin/forms/AdminRequisicionForm.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/admin/forms/AdminRequisicionForm.jsx)
- listarlas en el historial de requisiciones del módulo Admin
- enviarlas al flujo de validación de Torre
- confirmar la requisición en Torre desde [src/modules/torre/ScreenTorreDetail.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/torre/ScreenTorreDetail.jsx)

El flujo actual termina en la confirmación de la `purchase.order`, pero no cubre todavía:
- mostrar un estado logístico posterior a la confirmación
- recibir físicamente el producto desde la PWA
- soportar recepción parcial
- resolver automáticamente el `stock.picking.type` correcto según empresa y CEDIS

La sesión actual de la PWA ya expone `employee_id`, `company_id` y `warehouse_id`, y el formulario de requisiciones ya captura `analytic_distribution` como cuenta analítica. Eso permite usar la cuenta analítica como fuente de verdad para identificar el CEDIS operativo.

## Objetivo
Extender el flujo de requisiciones para que `gerente_sucursal` vea y ejecute la recepción real de Odoo desde el historial de requisiciones, con soporte de recepción parcial y con resolución automática del tipo de operación según:
- `company_id` de la requisición
- cuenta analítica seleccionada en la requisición, usada como identificador del CEDIS

## Alcance
Incluye:
- agregar estados PWA derivados de recepción: `Confirmado`, `Parcialmente recibido`, `Recibido`
- agregar botón `Recibir producto` o `Continuar recepción` dentro del historial/detalle de requisiciones
- operar sobre el `stock.picking` real de recepción de Odoo
- soportar recepción parcial por línea
- resolver automáticamente `stock.picking.type` usando `empresa + cuenta analítica(CEDIS)`
- asegurar que la cuenta analítica quede grabada en las líneas relevantes de requisición/cotización

No incluye:
- crear un estado nuevo en `purchase.order.state`
- crear una pantalla nueva separada de recepciones para gerente
- permitir elegir manualmente el almacén destino en frontend
- crear reglas hardcodeadas por empleado en la PWA

## Decisión de Diseño
Se implementará el flujo centrado en el historial de requisiciones.

El historial seguirá siendo el punto de verdad visible para `gerente_sucursal`:
1. la requisición se crea desde Admin
2. Torre la completa y la confirma
3. Odoo genera el picking de recepción real
4. el gerente recibe parcial o totalmente desde la misma experiencia de requisiciones
5. la PWA muestra el estado logístico derivado según cantidades recibidas

No se agregará una bandeja aparte de recepciones. La experiencia debe permanecer dentro de `Requisiciones > Historial`.

## Reglas de Negocio

### Estados de recepción PWA
El estado logístico visible en PWA no debe crear un `state` nuevo en `purchase.order`. Debe derivarse leyendo la recepción real de Odoo.

Estados:
- `confirmed`: la requisición/OC está confirmada y nada ha sido recibido
- `partially_received`: existe recibido > 0 pero aún queda cantidad pendiente
- `received`: toda la cantidad esperada de todas las líneas ya fue recibida

Etiquetas UI:
- `Confirmado`
- `Parcialmente recibido`
- `Recibido`

### Recepción parcial
- debe permitirse recibir menos de lo pendiente por línea
- no debe permitirse recibir más de lo pendiente
- mientras una o más líneas sigan con pendiente, el estado debe quedar `Parcialmente recibido`
- solo cuando todo el picking quede completamente recibido, el estado debe pasar a `Recibido`

### Tipo de operación automático
La resolución del tipo de operación debe ser backend-driven, no frontend-driven.

Llave funcional:
- `company_id` de la requisición
- cuenta analítica usada en la requisición para representar el CEDIS

Ejemplo aprobado:
- empleado con cuenta analítica `[IGU] Iguala`
- requisición hecha para `Fabricación de Congelados`
- resultado esperado: picking type `Fabricación de Congelados: CEDIS Iguala`

### Cuenta analítica como identidad del CEDIS
La cuenta analítica deja de ser solo un dato contable y pasa a ser también la identidad operativa del CEDIS para este flujo.

Debe servir para:
- identificar el CEDIS de la requisición
- resolver el `stock.picking.type`
- poblar la analítica correcta en las líneas de requisición/cotización

### Fuente de verdad de empresa
La empresa no debe inferirse desde el empleado para este flujo. Debe salir del `payload` de la requisición/cotización, es decir del `company_id` con el que se crea la transacción en la PWA.

## UX Propuesta

### Ubicación
La recepción debe estar en el historial de requisiciones del puesto `gerente_sucursal`.

### Estados visibles en historial
Cada card o detalle de requisición debe mostrar:
- estado de compra actual
- estado logístico derivado de recepción

Comportamiento:
- `Confirmado` + botón `Recibir producto` si hay picking pendiente y nada recibido
- `Parcialmente recibido` + botón `Continuar recepción` si ya hubo recepción parcial
- `Recibido` en verde sin botón de recepción

### Modal o detalle de recepción
Al pulsar `Recibir producto` o `Continuar recepción`, la PWA debe cargar el picking real de Odoo y mostrar por línea:
- producto
- cantidad ordenada
- cantidad ya recibida
- cantidad pendiente
- campo editable `recibir ahora`

Acciones:
- `Cancelar`
- `Guardar recepción`

La captura debe ser por línea y reflejar cantidades reales del picking.

## Modelo Técnico Recomendado

### Estado derivado de recepción
Agregar al backend de requisiciones un bloque derivado, por ejemplo:

```json
{
  "receipt_state": "partially_received",
  "qty_received_total": 8.0,
  "qty_pending_total": 12.0,
  "can_receive": true,
  "incoming_picking_id": 456
}
```

El frontend no debe deducir esto localmente a partir de heurísticas; el backend debe devolverlo ya resuelto.

### Configuración de mapeo empresa + CEDIS
Se recomienda crear una configuración explícita en Odoo, por ejemplo un modelo propio o una tabla/configuración equivalente, con:
- `company_id`
- `analytic_account_id`
- `picking_type_id`
- opcionalmente `warehouse_id`
- opcionalmente `location_dest_id`

Esto evita:
- hardcodes por empleado
- condicionales frágiles en frontend
- depender de nombres de almacén en texto libre

### Confirmación en Torre
Cuando Torre confirme la requisición, el backend debe asegurar que:
- la OC quede correctamente confirmada
- el flujo de recepción nazca con el tipo de operación correcto ya resuelto
- la configuración `empresa + cuenta analítica` exista y sea validada

Si falta configuración, debe fallar con error explícito de negocio.

## Integración Esperada

### Frontend PWA
Áreas impactadas:
- historial de requisiciones en [src/modules/admin/forms/AdminRequisicionForm.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/admin/forms/AdminRequisicionForm.jsx)
- modal/detalle actual de requisición en [src/modules/admin/components/RequisitionDetailModal.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/admin/components/RequisitionDetailModal.jsx)
- confirmación actual de Torre en [src/modules/torre/ScreenTorreDetail.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/torre/ScreenTorreDetail.jsx)
- passthroughs del BFF local en [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js)

### Backend/BFF esperado
Se necesitan al menos estas capacidades:
- extender `GET /pwa-admin/requisitions`
- extender `GET /pwa-admin/requisition-detail`
- exponer detalle del picking de recepción ligado a la requisición
- exponer acción de recepción parcial/total sobre el picking real
- resolver `picking_type_id` por `company_id + analytic_account_id`

### Contrato conceptual de recepción
Endpoint conceptual recomendado:
- `GET /pwa-admin/requisition-receipt-detail?id=PO_ID`
- `POST /pwa-admin/requisition-receive`

Payload conceptual:

```json
{
  "purchase_order_id": 123,
  "picking_id": 456,
  "lines": [
    {
      "move_id": 1001,
      "receive_now_qty": 5
    },
    {
      "move_id": 1002,
      "receive_now_qty": 2
    }
  ]
}
```

Resultado esperado:
- actualiza el picking real de Odoo
- recalcula el estado derivado
- devuelve si quedó `partially_received` o `received`

## Manejo de Errores

### Falta de configuración empresa + CEDIS
Debe bloquearse con error claro:
- no se puede confirmar ni recibir si no existe la combinación configurada
- el mensaje debe indicar qué empresa y qué cuenta analítica/CEDIS faltan

### Picking inexistente o inconsistente
- si la requisición está confirmada pero no existe picking de recepción esperable, debe mostrarse error operativo claro
- no debe inventarse un estado `Recibido`

### Sobre recepción
- no permitir cantidades negativas
- no permitir recibir más de lo pendiente
- si una línea llega en cero en la captura, debe interpretarse como “no recibir ahora”, no como error

## Criterios de Aceptación
- una requisición confirmada en Torre aparece en historial con estado `Confirmado`
- el historial muestra botón `Recibir producto` cuando exista recepción pendiente
- al recibir solo parte de una o más líneas, el estado cambia a `Parcialmente recibido`
- al recibir todo lo pendiente, el estado cambia a `Recibido`
- `Recibido` se muestra en verde
- la recepción opera sobre el `stock.picking` real de Odoo
- la combinación `empresa + cuenta analítica` resuelve automáticamente el `stock.picking.type`
- las líneas relevantes conservan su `analytic_distribution`
- si falta configuración de la combinación, el backend responde con error claro y no adivina un picking type

## Riesgos
- el vínculo exacto entre `purchase.order`, `stock.picking` y los movimientos disponibles para recepción puede variar según cómo esté implementado el módulo Odoo actual
- si la cuenta analítica no viaja de forma consistente en todas las líneas o documentos, la resolución del CEDIS puede romperse
- si hoy el picking type se asigna demasiado tarde en el flujo, puede ser necesario mover esa decisión al momento de confirmar la requisición en Torre

## Verificación
- crear requisición con cuenta analítica `[IGU] Iguala`
- confirmar la requisición en Torre para empresa `Fabricación de Congelados`
- validar que el tipo de operación resuelto corresponda a `Fabricación de Congelados: CEDIS Iguala`
- validar que el historial muestre `Confirmado`
- recibir parcialmente una línea y validar `Parcialmente recibido`
- recibir el resto y validar `Recibido`
- validar que el inventario entre al almacén destino del picking real
- validar error explícito si falta configuración de `empresa + cuenta analítica`
