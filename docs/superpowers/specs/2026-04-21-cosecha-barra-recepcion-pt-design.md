# Confirmación de Cosecha de Barra con Recepción PT

## Contexto
Hoy el flujo de `operador_barra` permite cosechar una canastilla desde [src/modules/produccion/ScreenTanque.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/produccion/ScreenTanque.jsx), pero esa acción solo ejecuta `action_cosechar` sobre `x_ice.brine.slot` y registra datos operativos de extracción.

No existe hoy un puente directo entre:
- la cosecha de una canastilla de barra
- la recepción pendiente que debe atender `almacenista_pt`

Eso deja un hueco operativo:
- producción sabe que la canastilla fue cosechada
- PT no recibe automáticamente una solicitud de recepción por esa barra
- la coordinación queda fuera del sistema

## Objetivo
Agregar una confirmación explícita al cosechar una canastilla de barra y, al confirmarla, generar automáticamente una solicitud de recepción para `almacenista_pt`.

Regla de negocio aprobada:
- cada canastilla cosechada genera una recepción pendiente por `8 barras`

## Alcance
Incluye:
- agregar confirmación final de cosecha en `operador_barra`
- mostrar producto, canastilla y cantidad a recibir en PT
- ejecutar la cosecha del slot
- generar una recepción pendiente para PT
- reutilizar el flujo actual de recepción PT para que el almacenista la vea en su pantalla normal

No incluye:
- cambiar rutas o tarjetas de PT
- cambiar el flujo de transformación
- cambiar el cierre o la lógica HACCP
- bloquear navegación adicional fuera de esta interacción

## Decisión de Diseño
Se implementará el flujo recomendado:
1. el operador selecciona una canastilla lista
2. la app muestra una confirmación final
3. al confirmar, la app cosecha el slot y crea una recepción pendiente para PT

No se agregará una bandeja intermedia ni se diferirá el alta de recepción. La recepción debe nacer en el momento de la cosecha confirmada.

## Reglas de Negocio
### Confirmación de cosecha
- la cosecha de barra requiere confirmación explícita antes de ejecutarse
- el mensaje de confirmación debe dejar claro que se generará una recepción para `Almacén PT`

### Cantidad reportada
- cada canastilla cosechada genera `8 barras`
- para esta feature, la cantidad no se deriva de `bars_per_basket`
- la cantidad operativa de recepción es fija por decisión de negocio

### Producto
El producto reportado a PT debe resolverse con esta prioridad:
1. `slot.x_product_id`
2. `tank.bar_product_id`

Eso mantiene consistencia con el producto que ya ve el operador en la UI de cosecha.

### Recepción PT
- la solicitud debe entrar al flujo normal de recepción PT
- el almacenista debe verla en [src/modules/almacen-pt/ScreenRecepcion.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/almacen-pt/ScreenRecepcion.jsx) como pendiente
- no debe crearse un flujo paralelo de “avisos” fuera del sistema de recepción

## UX Propuesta
Cuando el operador pulse `Cosechar` y no existan bloqueos de temperatura o sal, se mostrará una confirmación final adicional en la misma pantalla de tanque.

La confirmación debe mostrar:
- canastilla
- producto detectado
- cantidad: `8 barras`
- mensaje tipo `Se generará una recepción pendiente para Almacén PT`

Acciones:
- `Cancelar`
- `Confirmar cosecha`

Si el usuario confirma, el flujo continúa sin pedir capturas adicionales.

## Reutilización de Flujos
No conviene crear un modelo nuevo de “solicitudes PT” si PT ya consume pendientes de recepción.

La nueva integración debe aterrizar en la misma estructura que ya usa `Recepción PT`, para que:
- el almacenista no aprenda otra pantalla
- la recepción se vea en el bucket correcto
- el backend siga siendo autoridad del estado pendiente/recibido

## Contrato Técnico Esperado
La recomendación es exponer una operación coordinada en el BFF/PWA local, por ejemplo:
- `POST /pwa-prod/harvest-with-pt-reception`

Payload conceptual:

```json
{
  "slot_id": 123,
  "temperature": -8.5,
  "product_id": 724,
  "qty_reported": 8
}
```

Resultado esperado:
- el slot queda cosechado
- se crea el pendiente de recepción PT

## Integración Backend Esperada
La operación coordinada debe ejecutar en orden:
1. cosecha del slot (`action_cosechar`)
2. alta del pendiente de recepción PT

La recepción debe incluir al menos:
- `product_id`
- `qty_reported = 8`
- referencia suficiente para que PT la reciba y la identifique

Si el backend actual de PT ya espera una entidad específica de recepción o posting, el cambio debe reusar esa entidad en lugar de introducir otra.

## Manejo de Errores
### Si falla la cosecha
- no debe generarse la recepción PT
- el slot debe permanecer sin cosechar
- la UI debe mostrar error claro

### Si la cosecha sale pero falla la recepción PT
- la UI debe tratarlo como error alto
- el mensaje debe indicar explícitamente que la canastilla sí fue cosechada pero la recepción PT no se generó
- no debe ocultarse este caso con un éxito parcial ambiguo

La preferencia técnica es minimizar este escenario con un endpoint coordinado.

## Impacto Técnico Esperado
### UI Producción
- actualizar [src/modules/produccion/ScreenTanque.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/produccion/ScreenTanque.jsx)
- posiblemente extraer helper para resolver producto efectivo y payload de recepción

### API Producción
- agregar llamada nueva en [src/modules/produccion/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/produccion/api.js)
- agregar passthrough/coordinación en [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js)

### PT
- no requiere pantalla nueva
- debe reflejarse en el listado de pendientes de recepción existente

## Criterios de Aceptación
- al cosechar una canastilla de barra, se muestra confirmación final
- la confirmación muestra producto y cantidad `8 barras`
- al confirmar, la canastilla se cosecha
- al confirmar, se crea una recepción pendiente para PT
- el almacenista PT ve la solicitud en `Recepción`
- si falla la cosecha, no se crea solicitud PT
- si falla la recepción PT, la UI muestra un error explícito de desfase operativo

## Riesgos
- el backend actual de cosecha no parece crear movimientos o recepciones PT por sí mismo; habrá que coordinar dos acciones que hoy están separadas
- si el producto no está bien configurado en `slot.x_product_id` o `tank.bar_product_id`, la solicitud de PT podría nacer sin producto válido
- si PT tiene validaciones más estrictas sobre el origen de pendientes, habrá que adaptar el contrato del backend y no solo el frontend

## Verificación
- abrir una canastilla lista de barra y validar que aparece la confirmación final
- confirmar que el modal muestra el producto correcto
- confirmar que la cantidad mostrada es `8 barras`
- confirmar cosecha exitosa y verificar que el slot cambia a cosechado
- verificar que aparece una recepción pendiente para PT
- validar que PT puede abrir la recepción y capturarla en su flujo actual
