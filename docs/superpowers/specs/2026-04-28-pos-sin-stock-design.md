# POS Sin Restriccion Por Stock Design

## Contexto

Hoy el POS de `Admin Sucursal` bloquea la venta cuando el stock visible es `0` o cuando la cantidad solicitada supera el stock mostrado. Ese bloqueo existe en frontend tanto en desktop como en mobile legacy:

- `src/modules/admin/forms/AdminPosForm.jsx`
- `src/modules/admin/ScreenPOS.jsx`

El endpoint de venta `POST /pwa-admin/sale-create` no se implementa en este repo; se delega directo a Odoo. En este frontend el stock se usa hoy como candado de UX, no como validacion final de backend.

## Objetivo

Permitir ventas de mostrador aunque el stock visible sea `0` o insuficiente, sin advertencias ni confirmaciones extra, en ambos POS (`desktop` y `mobile`).

## Alcance

- Cambiar el POS desktop para permitir agregar productos con stock `0`.
- Cambiar el POS desktop para permitir incrementar cantidad por encima del stock visible.
- Cambiar el POS mobile legacy con la misma regla.
- Mantener el stock mostrado solo como dato informativo.
- Mantener intacto el flujo de `createSaleOrder`.
- Mantener intacto el manejo de errores si Odoo rechaza la operacion.

## Fuera de Alcance

- Cambios al backend Odoo `gf_pwa_admin.sale-create`.
- Nuevas advertencias, confirmaciones o autorizaciones por falta de stock.
- Cambios al flujo de `dispatch-ticket`.
- Ajustes de inventario o logica contable fuera del POS frontend.

## Decision

Se adopta el enfoque 2: quitar el candado visual por stock y tratar el stock como informativo, no restrictivo.

## Comportamiento Deseado

### Desktop

- Un producto con `stock <= 0` sigue siendo clickeable.
- Si el producto ya esta en carrito, se puede aumentar `qty` sin tope por stock.
- La tarjeta del producto no debe verse deshabilitada por falta de stock.
- El texto de stock no debe decir `Sin stock` si la venta esta permitida; debe usar una etiqueta neutral como `Stock 0`.

### Mobile Legacy

- Un producto con `stock <= 0` sigue siendo clickeable.
- Si el producto ya esta en carrito, se puede aumentar `qty` sin tope por stock.
- La tarjeta del producto no debe verse deshabilitada por falta de stock.
- El texto de stock debe seguir siendo informativo y neutral.

### Backend / Errores

- El payload enviado a `createSaleOrder` no cambia.
- Si Odoo permite inventario negativo, la venta debe continuar normalmente.
- Si Odoo rechaza la venta, la UI debe seguir mostrando el error de backend sin maquillarlo.

## Archivos Afectados

- `src/modules/admin/forms/AdminPosForm.jsx`
- `src/modules/admin/ScreenPOS.jsx`
- `tests/`:
  - agregar pruebas de la logica compartida o helpers nuevos si se extrae comportamiento

## Estrategia Tecnica

Conviene extraer una pequeña logica compartida para el comportamiento del carrito POS:

- resolver el stock mostrado
- agregar al carrito
- actualizar cantidad

La regla nueva debe ser:

- el stock puede mostrarse
- el stock no limita `addToCart`
- el stock no limita `updateQty`

Si la extraccion no reduce duplicacion de forma clara, se permite hacer el cambio directo en ambos archivos, siempre que desktop y mobile queden alineados.

## Riesgos

1. El backend Odoo puede seguir rechazando ventas sin stock aunque frontend ya no las bloquee.
2. La UI puede quedar semantica o visualmente inconsistente si sigue usando etiquetas como `Sin stock` junto con botones activos.
3. Desktop y mobile pueden divergir si uno elimina el tope y el otro no.

## Mitigaciones

1. No cambiar el manejo de errores existente: cualquier rechazo de Odoo se sigue mostrando en pantalla.
2. Ajustar las etiquetas visuales de stock a un texto neutral.
3. Cubrir la logica nueva con pruebas en helpers puros cuando sea posible.

## Testing

- Prueba unitaria de la logica nueva del carrito, idealmente sobre helper puro:
  - permite agregar producto con stock `0`
  - permite incrementar cantidad arriba del stock visible
  - conserva eliminacion al bajar cantidad a `0`
- Verificacion manual:
  - abrir `/admin/pos` desktop
  - agregar producto con stock `0`
  - subir cantidad por encima del stock visible
  - confirmar que la UI no muestra bloqueo previo
  - repetir en vista mobile legacy

## Resultado Esperado

El POS de `Admin Sucursal` deja de usar el stock como candado visual y permite capturar ventas aunque el inventario visible este en cero o por debajo de la cantidad vendida, tanto en desktop como en mobile.
