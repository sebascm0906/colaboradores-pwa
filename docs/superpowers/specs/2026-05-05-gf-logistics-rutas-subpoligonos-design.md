# GF Logistics rutas, subpoligonos y planeacion diaria

## Contexto

El flujo actual de Supervisor de Ventas planea rutas diarias desde rutas maestras `gf.route` y crea o reutiliza `gf.route.plan`. El siguiente cambio agrega dos necesidades:

- permitir archivar rutas maestras de `gf_logistics` para que no se usen en planeacion futura;
- redisenar la seleccion de clientes de una ruta diaria con poligono, subpoligono, canales, dia de visita y ventana horaria.
- permitir que Supervisor de Ventas agregue manualmente un cliente a un plan diario activo para que aparezca al chofer en su app.

Estos cambios afectan Odoo y la PWA. Odoo debe ser la fuente de verdad para modelos, geometria, filtros y generacion de `gf.route.stop`. La PWA debe capturar criterios y mostrar errores operables.

## Objetivos

- Archivar rutas maestras sin perder historico.
- Mantener `gf.route.plan` y `gf.route.stop` historicos intactos.
- Agregar subpoligonos como identidad contenida dentro de un poligono padre.
- Permitir que Supervisor de Ventas arme planes diarios filtrando clientes por ruta, poligono, subpoligono opcional, canales, dia de visita y ventana horaria.
- Permitir que Supervisor de Ventas seleccione un plan diario activo y agregue un cliente al plan.
- Si no se selecciona dia de visita, incluir todos los clientes que cumplan los demas filtros.
- Si no se selecciona subpoligono, usar todo el poligono padre.
- Evitar planes incompletos: si falta configuracion geografica o no se pueden generar stops, devolver un error claro para avisar al administrador.

## No objetivos

- No borrar rutas, planes ni stops historicos.
- No generar stops desde la PWA mediante escrituras genericas ORM.
- No permitir subpoligonos fuera del poligono padre.
- No guardar dia, canal ni ventana horaria en poligonos o subpoligonos; esos campos viven solo en clientes.
- No resolver limpieza masiva de datos historicos en este cambio, salvo exponer errores que ayuden a corregirlos.

## Archivado de rutas

Las rutas maestras `gf.route` se archivan con `active = false`.

Reglas:

- Una ruta archivada no aparece en la PWA de Supervisor de Ventas.
- Una ruta archivada no aparece para crear nuevos planes diarios.
- Los `gf.route.plan` existentes conservan su `route_id`.
- Los historicos de ventas, visitas, liquidaciones, devoluciones y stops no cambian.
- Si `gf.route` no tiene campo `active` en algun ambiente, Odoo debe agregarlo o exponer un equivalente estable antes de activar la funcion en PWA.

La PWA debe agregar una accion administrativa para archivar rutas solo donde el rol tenga permisos administrativos. La operacion debe pedir confirmacion y mostrar que no elimina historico.

## Modelo de subpoligono

Agregar una nueva identidad de Odoo para subpoligonos. Nombre tecnico propuesto: `gf.route.subpolygon`.

Los subpoligonos son meramente geograficos. Se crean desde la misma vista donde hoy se disenan los poligonos, usando el poligono padre como contenedor. El disenador no debe pedir canal, dia de visita ni ventana horaria al crear o editar un subpoligono.

Campos propuestos:

- `name`: nombre del subpoligono.
- `polygon_id`: many2one al poligono padre existente.
- `geometry`: geometria del subpoligono.
- `active`: archivado.
- `company_id`: compania.
- `warehouse_id` o equivalente operativo si el poligono padre ya esta segmentado por CEDIS.

Reglas:

- El subpoligono debe estar contenido dentro de su poligono padre.
- No se puede guardar un subpoligono cuya geometria salga del poligono padre.
- El nombre del subpoligono no necesita coincidir con la ruta.
- La opcion "Ninguno" no es un registro: significa no aplicar filtro de subpoligono.
- Canal, dia y ventana no existen como campos del subpoligono.

## Disenador de poligonos y subpoligonos

La vista existente para crear poligonos debe evolucionar para tambien crear subpoligonos.

Flujo:

1. El usuario selecciona o crea un poligono padre.
2. Dibuja el poligono padre en el mapa.
3. Desde ese poligono, puede crear subpoligonos contenidos.
4. Para cada subpoligono solo captura nombre y geometria.
5. La vista valida visualmente y server-side que el subpoligono quede dentro del poligono padre.

Reglas visuales:

- Cada poligono debe tener un color propio para distinguirlo de otros poligonos.
- El color debe ser visible sobre el mapa y mantener buen contraste con la letra de subpoligono.
- Los clientes sin poligono asignado deben mostrarse en negro.
- Los marcadores de clientes deben ser mas grandes que los puntos actuales para que se puedan leer en campo y en escritorio.
- Al seleccionar un poligono, los puntos de clientes dentro del poligono deben resaltarse con el color de ese poligono.
- Al crear subpoligonos, los clientes dentro de cada subpoligono deben conservar el color del poligono padre y mostrar una letra dentro del marcador.
- El primer subpoligono del poligono seleccionado usa letra `A`, el segundo `B`, y asi sucesivamente.
- La letra identifica el subpoligono en el mapa, no sustituye su nombre.
- La leyenda del mapa debe actualizarse dinamicamente segun los subpoligonos visibles:
  - `A - Nombre del subpoligono`
  - `B - Nombre del subpoligono`
- Si se cambia el nombre del subpoligono, la leyenda se actualiza.
- Los clientes dentro del poligono padre pero fuera de subpoligonos quedan con el color del poligono y sin letra.
- Los clientes fuera del poligono seleccionado quedan con estilo neutro o atenuado.

La PWA no debe inferir pertenencia con reglas distintas a Odoo. Puede hacer previsualizacion en el mapa para experiencia de usuario, pero el guardado y la validacion final deben confirmarse en backend.

## Datos de cliente

Los clientes deben tener campos suficientes para filtrar visitas:

- ubicacion geografica usable para evaluacion contra poligono/subpoligono;
- canal o canales comerciales;
- dia o dias de visita;
- ventana horaria preferente o permitida.

Los nombres de campos finales deben confirmarse contra los modelos reales de Odoo antes de implementar. Si no existen, Odoo debe agregarlos y definir una migracion/correccion de datos.

Estos campos viven en clientes, no en poligonos ni subpoligonos.

Regla de dia:

- Si Supervisor de Ventas selecciona uno o mas dias, solo entran clientes configurados para esos dias.
- Si no selecciona ningun dia, entran todos los clientes que cumplan poligono/subpoligono/canales, sin filtrar por dia.

## Ventanas horarias

Debe existir un catalogo de ventanas horarias. Nombre tecnico propuesto: `gf.route.time.window`.

Valores base:

- Cualquier hora: sin restriccion horaria. Debe ser el valor predeterminado.
- Manana: 1am a 12pm.
- Tarde: 12pm a 7pm.
- Noche: 7pm a 12am.

Reglas:

- Si Supervisor de Ventas no selecciona ventana, se usa "Cualquier hora".
- Cada cliente puede tener una ventana preferente o permitida, segun el modelo final acordado.
- En planeacion, Supervisor de Ventas puede filtrar por una ventana.
- "Cualquier hora" no aplica filtro por ventana.

## Flujo PWA de Supervisor de Ventas

La pantalla de planeacion diaria debe pedir:

1. Ruta/chofer: `gf.route`.
2. Poligono padre.
3. Subpoligono: lista filtrada por poligono padre, mas opcion "Ninguno".
4. Canales: seleccion multiple.
5. Dia de visita: seleccion opcional; si queda vacio, entran todos.
6. Ventana horaria: valor predeterminado "Cualquier hora".
7. Forecast de productos.

Despues de capturar criterios y forecast, la PWA llama a un endpoint backend para asegurar/generar el plan.

## Agregar cliente manualmente a un plan activo

Supervisor de Ventas debe poder seleccionar uno de los planes diarios activos y agregar un cliente al plan. El objetivo es que el cliente aparezca al chofer en su app como una parada adicional.

Flujo PWA:

1. La supervisora abre una vista de planes diarios activos.
2. Selecciona un `gf.route.plan`.
3. Busca un cliente.
4. La PWA muestra datos utiles del cliente: nombre, direccion, canal, dia de visita, ventana horaria y ubicacion si existen.
5. La supervisora confirma agregarlo al plan.
6. El backend crea un `gf.route.stop` adicional asociado al plan.
7. Al refrescar la app del chofer, la parada aparece en su ruta.

Reglas:

- Solo se pueden modificar planes activos en estados permitidos. Estados propuestos: `draft` e `in_progress`.
- No se debe permitir agregar clientes a planes `closed`, `reconciled` o cancelados.
- Si el cliente ya existe como stop en el plan, el backend debe responder idempotente o con error funcional claro `customer_already_in_plan`.
- El backend define la secuencia de la nueva parada. Puede colocarla al final por defecto.
- Si el cliente no tiene ubicacion, se puede agregar solo si negocio lo permite; si no, devolver `missing_customer_geo`.
- La parada manual debe quedar marcada con origen `manual` si el modelo lo soporta, para auditoria.

Endpoint propuesto:

`POST /gf/salesops/supervisor/v2/route_plan/add_customer`

Payload propuesto:

```json
{
  "meta": {
    "employee_id": 123,
    "warehouse_id": 45
  },
  "data": {
    "route_plan_id": 100,
    "customer_id": 555,
    "notes": "Agregar por solicitud comercial"
  }
}
```

Respuesta exitosa:

```json
{
  "status": "ok",
  "data": {
    "route_plan_id": 100,
    "stop_id": 900,
    "stops_total": 49
  }
}
```

Errores funcionales esperados:

- `plan_not_found`: plan no existe o no pertenece al alcance de la supervisora.
- `plan_not_editable`: el estado del plan ya no permite agregar clientes.
- `customer_not_found`: cliente no existe o no pertenece al alcance.
- `customer_already_in_plan`: el cliente ya esta en el plan.
- `missing_customer_geo`: cliente sin ubicacion si se requiere geografia.
- `stop_create_failed`: no se pudo crear la parada.

## Backend de generacion de plan

Endpoint propuesto:

`POST /gf/salesops/supervisor/v2/route_plan/ensure`

Payload propuesto:

```json
{
  "meta": {
    "employee_id": 123,
    "warehouse_id": 45
  },
  "data": {
    "route_id": 10,
    "date_target": "2026-05-06",
    "polygon_id": 20,
    "subpolygon_id": null,
    "channel_ids": [1, 2],
    "visit_days": [],
    "time_window_id": null
  }
}
```

Interpretacion:

- `subpolygon_id = null`: usar todo el poligono padre.
- `visit_days = []`: no filtrar por dia; incluir todos los clientes que cumplan los demas filtros.
- `time_window_id = null`: usar "Cualquier hora"; no filtrar por ventana.

Respuesta exitosa:

```json
{
  "status": "ok",
  "data": {
    "plan_id": 100,
    "state": "draft",
    "polygon_id": 20,
    "subpolygon_id": null,
    "stops_total": 48
  }
}
```

Errores funcionales esperados:

- `polygon_required`: no se mando poligono.
- `polygon_not_found`: el poligono no existe o no pertenece al CEDIS/compania.
- `subpolygon_outside_polygon`: el subpoligono no pertenece al poligono seleccionado.
- `channels_required`: no se selecciono canal, si negocio decide que canal es obligatorio.
- `no_customers_found`: no hay clientes con esos filtros.
- `missing_customer_geo`: hay clientes sin datos geograficos suficientes.
- `stop_generation_failed`: no se pudieron crear stops.

La PWA debe mostrar mensajes accionables. Ejemplo:

"No se pudo generar la ruta: no hay clientes para el poligono, canales y filtros seleccionados. Avisa al administrador que revise poligonos, subpoligonos y datos de clientes."

## Aceptacion de carga e inicio de ruta

Cuando el jefe de ruta acepta la carga desde `/ruta/aceptar-carga`, el backend debe dejar el `gf.route.plan.state` en `in_progress`.

La PWA debe reflejar en memoria:

- `load_sealed = true`;
- `state = "in_progress"` en el plan y en la carga si el backend lo devuelve.

Esto permite que el flujo diario avance de `draft` a `in_progress` inmediatamente despues de aceptar carga.

## Cambios PWA necesarios

- Agregar filtros de poligono, subpoligono, canales, dia y ventana en `ScreenPronostico.jsx`.
- Agregar vista o panel para seleccionar planes diarios activos y agregar clientes manualmente.
- Agregar buscador de clientes para alta manual en plan.
- Agregar wrappers API para catalogos:
  - poligonos;
  - subpoligonos por poligono;
  - canales;
  - ventanas horarias.
- Agregar wrapper API para `route_plan/add_customer`.
- Extender `ensureDailyRoutePlan(routeId, dateTarget)` para enviar criterios de planeacion.
- Mostrar errores funcionales del backend sin degradarlos a "Error al crear plan".
- Bloquear guardado/confirmacion de forecast si el plan no pudo generar stops.
- Actualizar `ScreenAceptarCarga.jsx` para reflejar `plan.state = in_progress` tras `acceptLoad`.
- Agregar accion de archivar ruta en pantalla administrativa o modulo definido para administradores.
- Actualizar el disenador de poligonos para permitir dibujo de subpoligonos sin pedir dia, canal ni ventana.
- Agregar marcadores de clientes mas grandes, colores por poligono, negro para clientes sin poligono, letras por subpoligono y leyenda dinamica en el mapa.

## Cambios Odoo necesarios

- Confirmar/agregar `active` en `gf.route`.
- Agregar modelo de subpoligono y validacion geometrica contra poligono padre.
- Agregar o confirmar campos de cliente para canal, dias de visita y ventana horaria.
- Agregar catalogo de ventanas horarias con "Cualquier hora" como predeterminado.
- Agregar endpoint para agregar manualmente clientes a un plan diario activo.
- Actualizar `route_plan/ensure` para:
  - validar permisos, CEDIS y compania;
  - crear o reutilizar `gf.route.plan`;
  - asociar poligono/subpoligono;
  - resolver clientes por filtros;
  - generar `gf.route.stop`;
  - devolver conteos y errores funcionales.
- Actualizar `accept-load` para garantizar `state = in_progress`.
- Actualizar el backend del disenador de poligonos para guardar subpoligonos y validar contencion geometrica.

## Pruebas

Unitarias PWA:

- payload de planeacion conserva ruta, fecha, poligono, subpoligono, canales, dias y ventana.
- `visit_days = []` significa todos los dias.
- `subpolygon_id = null` significa poligono completo.
- errores funcionales del backend se muestran con mensaje accionable.
- aceptar carga actualiza `state` local a `in_progress`.

QA Odoo/PWA:

1. Archivar una ruta y verificar que ya no aparece para crear planes.
2. Confirmar que planes historicos de la ruta archivada siguen visibles en historico.
3. Crear plan con poligono y subpoligono "Ninguno"; verificar stops de todo el poligono.
4. Crear plan con subpoligono; verificar que solo entran clientes dentro del subpoligono.
5. Crear plan sin dia seleccionado; verificar que no filtra por dia.
6. Crear plan con dia seleccionado; verificar que filtra por dia.
7. Crear plan con multiples canales; verificar que entran clientes de cualquiera de esos canales.
8. Intentar generar plan sin clientes; verificar mensaje para administrador.
9. Aceptar carga como jefe de ruta; verificar `gf.route.plan.state = in_progress`.
10. Agregar manualmente un cliente a un plan activo; verificar que aparece como stop en la app del chofer.
11. Intentar agregar un cliente duplicado; verificar error o respuesta idempotente.
12. Crear subpoligono desde el disenador; verificar que no pide dia, canal ni ventana.
13. Seleccionar poligono en el mapa; verificar clientes con color propio del poligono y marcadores mas grandes.
14. Verificar que clientes sin poligono se muestran en negro.
15. Crear dos subpoligonos; verificar letras `A` y `B` en clientes y leyenda dinamica con nombres.

## Preguntas abiertas

- Nombre tecnico real del modelo de poligonos actual.
- Campos actuales de cliente para canal, dias de visita y ventana horaria.
- Si canal debe ser obligatorio o puede quedar vacio para incluir todos.
- Si una ventana horaria puede ser many2many en clientes o solo una preferente.
- Donde debe vivir la accion de archivar rutas en PWA: admin general, supervisor ventas o una pantalla nueva de configuracion logistica.
- Donde debe vivir la vista para agregar clientes a planes activos: dentro de Pronostico, Control Comercial o una pantalla especifica de planes diarios.
- Si clientes sin geografia pueden agregarse manualmente como stop o deben bloquearse.
