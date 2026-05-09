# Modulo KOLDCUP para Produccion de Vaso

## Contexto
Braulio reemplaza el puesto operativo que antes tenia Claudia Martinez, pero su proceso no es igual al de produccion de congelados, Almacen PT o Entregas. Su operacion se limita a KOLDCUP: compra insumo, produce vasos sellados, corta el dia y deja producto listo para Entregas Glaciem.

La PWA ya tiene piezas reutilizables:
- transformaciones PT en [src/modules/transformaciones/TransformationScreen.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/transformaciones/TransformationScreen.jsx)
- traspasos PT hacia Entregas en [src/modules/almacen-pt/ScreenTraspasoPT.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/almacen-pt/ScreenTraspasoPT.jsx)
- carga de unidades en [src/modules/entregas/ScreenCargaUnidades.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/entregas/ScreenCargaUnidades.jsx)
- cierre/caja en Admin y Entregas

Aunque esas piezas existen, KOLDCUP necesita una superficie propia para evitar exponer acciones de rolito, barra, PT general, materiales o handover que no aplican al puesto.

## Objetivo
Crear un modulo operativo KOLDCUP para `operador_koldcup` que permita:
- registrar compra real de insumo en Odoo
- registrar salida inmediata de caja CEDIS CDMX por esa compra
- producir vasos KOLDCUP sellados mediante una transformacion controlada por receta
- hacer corte final de produccion
- transferir el producto terminado hacia Entregas Glaciem

## Alcance
Incluye:
- nuevo modulo visible en home para el rol `operador_koldcup`
- flujo guiado del dia con pasos de compra, produccion, corte y traspaso
- compra real en Odoo, no gasto suelto ni nota local
- salida inmediata de caja CEDIS CDMX asociada a la compra
- recetas KOLDCUP configuradas en Odoo y consumidas por frontend
- produccion de vasos sellados como salida de transformacion
- corte final con validaciones de inventario/caja
- traspaso de PT Fabricacion de Congelados hacia almacen de Entregas Glaciem o ubicacion equivalente configurada

No incluye:
- modificar el flujo ya hecho de carga de unidades moviles
- rehacer cierre/corte de Entregas si ya cumple la operacion actual
- permitir a KOLDCUP usar todas las acciones de Almacen PT
- hardcodear SKUs, ubicaciones o almacenes finales en la PWA
- crear compras por escrituras genericas fragiles desde el frontend

## Decision de Diseno
Se implementara la opcion de modulo nuevo.

KOLDCUP debe tener rutas y UI propias, pero reutilizar servicios y patrones existentes donde tengan sentido. La autoridad transaccional debe vivir en backend/Odoo, especialmente para compra real, salida de caja y traspaso de inventario.

La PWA no debe crear `purchase.order`, movimientos de caja o `stock.picking` mediante escrituras genericas si el endpoint funcional no existe. Debe llamar endpoints de negocio `pwa-koldcup` y mostrar errores accionables cuando el backend no tenga configuracion suficiente.

## Rol y Navegacion

### Rol
Nuevo rol operativo:
- `operador_koldcup`

El rol debe ver:
- modulo `KOLDCUP`
- modulos universales: KPIs, encuestas, premios

No debe recibir por defecto:
- `registro_produccion`
- `almacen_pt`
- `entregas`
- `admin_sucursal`

Si Braulio necesita tambien funciones ya existentes, deben asignarse como roles adicionales explicitamente, no por acoplamiento del modulo KOLDCUP.

### Rutas propuestas
- `/koldcup`: hub del dia
- `/koldcup/compra`: compra de insumo
- `/koldcup/produccion`: produccion de vasos sellados
- `/koldcup/corte`: corte final
- `/koldcup/traspaso`: traspaso a Entregas Glaciem o confirmacion del traspaso generado

## Flujo Operativo

### 1. Compra de insumo KOLDCUP
El operador captura:
- proveedor, si aplica
- producto o insumo
- cantidad
- precio unitario
- total calculado
- notas opcionales

Al confirmar, el backend debe ejecutar una operacion atomica:
1. crear compra real en Odoo (`purchase.order`)
2. confirmar la compra si el flujo KOLDCUP lo requiere
3. crear/validar la recepcion de inventario si aplica
4. registrar salida inmediata de caja CEDIS CDMX por el total
5. enlazar la salida de caja con la compra
6. devolver resumen de compra, caja e inventario

Si cualquiera de esos pasos falla, el backend debe evitar dejar una compra aparentemente completa sin salida de caja o sin recepcion requerida.

### 2. Produccion de vaso
La produccion debe comportarse como una transformacion con `role_scope = "koldcup"`.

Entrada:
- insumo comprado o material configurado por receta
- cantidad consumida

Salida:
- producto terminado KOLDCUP
- cantidad de vasos que salieron y ya estan sellados

La receta debe venir de Odoo:
- producto de entrada
- producto de salida
- relacion esperada entre entrada y salida, si existe
- unidad de captura para entrada
- unidad de captura para salida
- tolerancias o bloqueos

La UI puede mostrar sugerencias de salida por receta, pero el backend debe validar disponibilidad, consumo y producto producido.

### 3. Corte final de produccion
El corte final valida el dia KOLDCUP antes de mover producto a Entregas.

Debe mostrar:
- compras del dia
- salida total de caja CEDIS CDMX
- insumo recibido
- insumo consumido
- vasos producidos sellados
- inventario restante
- diferencias o merma capturada
- estado del traspaso final

Bloqueos recomendados:
- compra creada sin salida de caja enlazada
- compra pagada sin recepcion/inventario cuando la receta requiere insumo disponible
- produccion sin receta valida
- consumo mayor al stock disponible
- diferencia de inventario sin nota
- traspaso pendiente si el corte se marca como cerrado

### 4. Traspaso a Entregas Glaciem
Al cierre del dia, el flujo debe crear o confirmar traspaso de almacen:
- origen: PT de Fabricacion de Congelados o ubicacion operacional configurada para produccion KOLDCUP
- destino: almacen de Entregas Glaciem / EN Soluciones en Produccion Glaciem, segun configuracion Odoo
- producto: KOLDCUP terminado
- cantidad: vasos sellados disponibles para entrega

El destino no debe inferirse por texto libre en frontend. Debe venir de configuracion backend/Odoo por empresa, almacen o rol.

## UX Propuesta

### Hub KOLDCUP
El hub debe ser una linea de pasos del dia:
1. Compra
2. Produccion
3. Corte
4. Traspaso

Cada paso debe mostrar:
- estado: pendiente, en curso, listo, bloqueado
- resumen corto: total comprado, vasos producidos, diferencia, traspaso
- siguiente accion sugerida

### Compra
Pantalla mobile-first con:
- selector de insumo/proveedor desde catalogo backend
- cantidad y precio unitario
- total calculado
- confirmacion explicita: "Registrar compra y salida de caja"
- resultado con folio de compra y movimiento de caja

### Produccion
Puede reutilizar `TransformationScreen` mediante una nueva configuracion `koldcup`, ajustando textos:
- titulo: `Produccion KOLDCUP`
- subtitulo: `Vasos sellados`
- placeholder entrada: `Cantidad consumida`
- placeholder salida: `Vasos sellados`
- boton: `Confirmar produccion`

Si la transformacion compartida no soporta suficientemente el copy o unidades, se debe extraer configuracion adicional en helpers, no duplicar toda la pantalla.

### Corte
Pantalla de resumen con:
- tarjetas de compra/caja
- tarjetas de produccion/inventario
- captura de conteo final o diferencia
- notas obligatorias cuando exista diferencia
- boton `Cerrar produccion KOLDCUP`

### Traspaso
Si el corte genera el traspaso automaticamente, esta pantalla puede ser solo detalle/confirmacion.

Si requiere accion manual, debe mostrar:
- origen
- destino
- producto
- cantidad
- folio de transferencia
- estado de validacion

## Contratos Backend Recomendados

### Resumen del dia
`GET /pwa-koldcup/day-summary?warehouse_id=&employee_id=&date=YYYY-MM-DD`

Respuesta conceptual:
```json
{
  "ok": true,
  "data": {
    "date": "2026-05-09",
    "warehouse_id": 76,
    "cash_location": {
      "id": 123,
      "name": "Caja CEDIS CDMX"
    },
    "purchase": {
      "count": 1,
      "total_amount": 1200.0,
      "has_unlinked_cash_out": false
    },
    "production": {
      "input_qty": 10,
      "output_qty": 2500,
      "scrap_qty": 0
    },
    "inventory": {
      "input_available_qty": 4,
      "finished_available_qty": 2500
    },
    "close": {
      "state": "open",
      "can_close": true,
      "blockers": [],
      "warnings": []
    },
    "transfer": {
      "state": "pending",
      "picking_id": null
    }
  }
}
```

### Catalogo de compra
`GET /pwa-koldcup/purchase-catalog?warehouse_id=&employee_id=`

Debe devolver:
- proveedores permitidos o proveedor default
- insumos KOLDCUP comprables
- unidad de medida
- configuracion de caja CEDIS CDMX
- flags de recepcion automatica o manual

### Crear compra
`POST /pwa-koldcup/purchase-create`

Payload conceptual:
```json
{
  "warehouse_id": 76,
  "employee_id": 999,
  "supplier_id": 555,
  "product_id": 777,
  "qty": 10,
  "unit_price": 120.0,
  "notes": "Compra para produccion del dia"
}
```

Resultado conceptual:
```json
{
  "ok": true,
  "data": {
    "purchase_order_id": 1234,
    "purchase_name": "P01234",
    "cash_out_id": 5678,
    "cash_box_name": "Caja CEDIS CDMX",
    "amount_total": 1200.0,
    "receipt_state": "done",
    "inventory_posted": true
  }
}
```

Regla transaccional:
- compra real y salida de caja deben quedar enlazadas
- si caja no existe o no esta configurada, no debe confirmar la compra
- si no puede crear recepcion requerida, debe devolver error claro

### Catalogo de transformacion
Puede seguir el patron existente:
`GET /pwa-koldcup/transformation-catalog?warehouse_id=&employee_id=&role_scope=koldcup`

Tambien puede compartir el endpoint generico de transformaciones si el backend soporta `role_scope=koldcup`.

### Crear produccion
`POST /pwa-koldcup/transformation-create`

Payload compatible con transformaciones:
```json
{
  "warehouse_id": 76,
  "employee_id": 999,
  "role_scope": "koldcup",
  "recipe_code": "KOLDCUP_VASO",
  "input_product_id": 777,
  "input_qty_units": 10,
  "output_qty_units": 2500,
  "notes": ""
}
```

El backend debe:
- validar receta activa
- consumir inventario real
- crear producto terminado KOLDCUP
- devolver resumen de consumo, salida y diferencia esperada

### Cierre del dia
`POST /pwa-koldcup/day-close`

Payload conceptual:
```json
{
  "warehouse_id": 76,
  "employee_id": 999,
  "date": "2026-05-09",
  "final_input_count": 4,
  "final_finished_count": 2500,
  "difference_reason": ""
}
```

Resultado:
- estado de corte
- bloqueos si no puede cerrar
- transferencia creada o pendiente

### Traspaso a Entregas
`POST /pwa-koldcup/transfer-to-entregas`

Payload conceptual:
```json
{
  "warehouse_id": 76,
  "employee_id": 999,
  "date": "2026-05-09",
  "product_id": 888,
  "qty": 2500
}
```

El backend debe resolver origen/destino desde configuracion Odoo y devolver:
- `picking_id`
- `picking_name`
- origen
- destino
- estado

## Integracion Frontend

Archivos esperados:
- modificar [src/modules/registry.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/registry.js) para registrar modulo KOLDCUP
- modificar [src/App.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/App.jsx) para lazy routes KOLDCUP
- crear `src/modules/koldcup/ScreenKoldcupHub.jsx`
- crear `src/modules/koldcup/ScreenKoldcupCompra.jsx`
- crear `src/modules/koldcup/ScreenKoldcupProduccion.jsx`
- crear `src/modules/koldcup/ScreenKoldcupCorte.jsx`
- crear `src/modules/koldcup/ScreenKoldcupTraspaso.jsx`
- crear `src/modules/koldcup/koldcupService.js`
- extender `src/modules/transformaciones/utils/transformationHelpers.js` con `role_scope = "koldcup"` si se reutiliza `TransformationScreen`
- agregar passthroughs BFF en [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js) solo como delegacion a endpoints funcionales, no como escrituras genericas fragiles

## Integracion Odoo

Configuracion requerida:
- rol o puesto `operador_koldcup`
- caja CEDIS CDMX resoluble por configuracion
- proveedor default o catalogo de proveedores permitidos
- productos/insumos comprables KOLDCUP
- receta KOLDCUP activa
- producto terminado KOLDCUP
- ubicacion origen para PT KOLDCUP
- ubicacion destino Entregas Glaciem
- tipo de operacion para traspaso

Relaciones recomendadas:
- compra KOLDCUP enlazada a movimiento de caja
- produccion KOLDCUP enlazada a compra/stock disponible cuando aplique
- corte KOLDCUP enlazado a producciones y transferencia final
- transferencia final enlazada al corte

## Manejo de Errores

Errores de negocio que deben mostrarse sin colapsar a mensajes genericos:
- `koldcup_cash_box_not_configured`: falta caja CEDIS CDMX
- `koldcup_purchase_product_not_allowed`: producto no permitido para KOLDCUP
- `koldcup_supplier_required`: proveedor requerido
- `koldcup_purchase_cash_out_failed`: no se pudo registrar salida de caja
- `koldcup_recipe_not_configured`: falta receta KOLDCUP
- `koldcup_insufficient_stock`: consumo mayor a inventario disponible
- `koldcup_close_blocked`: corte bloqueado por inconsistencias
- `koldcup_transfer_destination_missing`: falta destino Entregas Glaciem
- `koldcup_transfer_failed`: no se pudo crear traspaso

## Pruebas Recomendadas

### Unitarias
- normalizacion de resumen del dia
- calculo de estados de pasos del hub
- validacion de formulario de compra
- validacion de corte con y sin bloqueos
- configuracion `role_scope = "koldcup"` en transformaciones

### Integracion Frontend
- modulo visible para `operador_koldcup`
- modulo no visible para roles no autorizados
- compra muestra total calculado y exige cantidad/precio validos
- produccion usa textos y unidades KOLDCUP
- corte bloquea cuando resumen devuelve blockers
- traspaso muestra origen/destino devueltos por backend

### Backend/Odoo
- `purchase-create` crea compra real y salida de caja enlazada
- falla atomico si caja CEDIS CDMX no existe
- transformacion consume insumo y produce KOLDCUP
- cierre bloquea diferencias sin nota
- traspaso resuelve origen/destino por configuracion

## Preguntas Abiertas
- Nombre exacto del producto terminado KOLDCUP en Odoo.
- Producto o productos de insumo que Braulio compra para vaso.
- Si la recepcion de compra debe ser automatica siempre o confirmable por Braulio.
- Modelo exacto de caja usado para representar salida inmediata de Caja CEDIS CDMX.
- Ubicaciones Odoo exactas para origen PT KOLDCUP y destino Entregas Glaciem.
