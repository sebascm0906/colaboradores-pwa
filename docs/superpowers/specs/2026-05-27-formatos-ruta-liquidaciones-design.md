# Formatos de Ruta en Liquidaciones

## Contexto

Aida Sugey necesita consultar, imprimir y descargar formatos operativos por chofer cuando una ruta ya fue cerrada correctamente. El flujo existente ya separa el cierre del chofer en `ruta`: corte de unidades, liquidacion y cierre de ruta. El modulo administrativo ya concentra las liquidaciones de planes cerrados en `Admin > Liquidaciones`, usando `/pwa-admin/liquidaciones/*`.

## Objetivo

Agregar formatos por plan de ruta cerrado dentro de `Admin > Liquidaciones`, sin cambiar la validacion actual de corte, liquidacion ni cierre. Al seleccionar una ruta/chofer, Aida debe poder ver en pantalla, imprimir y descargar:

- Lista de ventas
- Inventario cargado
- Mermas
- Corte
- Liquidacion

## Fuera de alcance

- Registrar ventas desde la PWA de colaboradores.
- Cambiar las reglas de cierre del chofer.
- Validar liquidaciones automaticamente.
- Crear PDF nativo si requiere dependencias nuevas pesadas.
- Inventar datos cuando el backend no los exponga.

## Punto de entrada

La funcionalidad vive en `Admin > Liquidaciones`, en la pantalla desktop actual. Se reutiliza el selector de planes pendientes y validados. Al seleccionar un plan, el panel derecho mantiene el detalle existente y agrega una seccion `Formatos de ruta`.

Los formatos solo se habilitan cuando el plan esta cerrado o conciliado. Si el backend no manda `state`, se considera habilitado cuando el plan proviene de los endpoints administrativos de liquidaciones cerradas, pero el view model debe exponer el motivo de bloqueo cuando detecte un estado claramente abierto.

## Datos

Fuente principal:

- `GET /pwa-admin/liquidaciones/detail?plan_id=N`

Datos esperados y tolerados:

- `summary` o `liquidation_summary`: pagos por metodo, total esperado, total cobrado y diferencia.
- `reconciliation_lines` o `lines`: producto, cargado, entregado, devuelto, merma y diferencia.
- Campos del plan: `id`, `name`, `route_name`, `driver_name`, `vehicle_name`, `date`, `state`.
- Ventas: si el backend envia `sales`, `orders`, `sale_orders`, `sales_lines` o informacion equivalente, el formato la normaliza. Si no existe, el formato muestra que la lista de ventas no esta disponible en este endpoint.

## Formatos

### Lista de ventas

Muestra ventas asociadas al plan cuando existan en el detalle. Debe incluir al menos folio, cliente, metodo de pago y total si esos campos vienen disponibles. Si no hay datos, muestra un estado explicito de no disponible.

### Inventario cargado

Muestra cada producto con cantidad cargada. Usa las lineas de conciliacion. Si no hay lineas, muestra estado vacio.

### Mermas

Muestra solo productos con merma mayor que cero. Incluye total de merma. Si no hay merma, muestra "Sin mermas registradas".

### Corte

Muestra por producto: cargado, entregado, devuelto, merma y diferencia. Incluye totales.

### Liquidacion

Muestra pagos por metodo, total esperado, total cobrado y diferencia. Debe aceptar shapes por buckets (`cash`, `credit`, `transfer`, `card`) o arreglos de pagos.

## Impresion y descarga

`Imprimir` usa `window.print()` y CSS `@media print` para imprimir solo el formato seleccionado.

`Descargar` genera un archivo `.html` autosuficiente con el formato seleccionado. El HTML debe incluir estilos basicos de tabla, encabezado del plan y totales. Esto evita meter una dependencia de PDF y conserva un archivo imprimible desde cualquier navegador.

## Componentes y limites

Se agregan unidades enfocadas:

- Un view model puro para normalizar el detalle en formatos.
- Un componente de visor de formatos para seleccionar, ver, imprimir y descargar.

`AdminLiquidacionesForm.jsx` solo orquesta: carga detalle, pasa el plan al visor y conserva la validacion actual.

## Manejo de errores

- Si falta detalle, no se renderizan formatos.
- Si una seccion no tiene datos, se muestra estado vacio o no disponible.
- Si el plan esta abierto, las acciones de formato quedan bloqueadas con motivo.
- Si `download` falla por entorno del navegador, se muestra error local sin afectar la liquidacion.

## Pruebas

Agregar pruebas con `node:test` para el view model:

- Plan cerrado habilita formatos.
- Plan abierto bloquea formatos.
- Inventario cargado normaliza lineas.
- Mermas filtra `qty_scrap > 0`.
- Corte calcula totales.
- Liquidacion normaliza pagos.
- Lista de ventas maneja ausencia de datos sin romper.
- HTML descargable contiene titulo, datos de plan y tabla del formato.

## Verificacion manual

1. Entrar a `Admin > Liquidaciones`.
2. Seleccionar una ruta cerrada pendiente.
3. Cambiar entre los cinco formatos.
4. Imprimir un formato y confirmar que solo sale el reporte.
5. Descargar un formato y abrir el HTML.
6. Repetir con una liquidacion validada en la pestana `Validadas` si el backend permite cargar detalle desde historial.
