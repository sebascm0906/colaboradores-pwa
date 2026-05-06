# GF Logistics rutas, subpoligonos y planeacion diaria

## Contexto

El flujo actual de Supervisor de Ventas planea rutas diarias desde rutas maestras `gf.route` y crea o reutiliza `gf.route.plan`. El siguiente cambio agrega dos necesidades:

- permitir archivar rutas maestras de `gf_logistics` para que no se usen en planeacion futura;
- redisenar la seleccion de clientes de una ruta diaria con poligono, subpoligono, canales, dia de visita y ventana horaria.

Estos cambios afectan Odoo y la PWA. Odoo debe ser la fuente de verdad para modelos, geometria, filtros y generacion de `gf.route.stop`. La PWA debe capturar criterios y mostrar errores operables.

## Objetivos

- Archivar rutas maestras sin perder historico.
- Mantener `gf.route.plan` y `gf.route.stop` historicos intactos.
- Agregar subpoligonos como identidad contenida dentro de un poligono padre.
- Permitir que Supervisor de Ventas arme planes diarios filtrando clientes por ruta, poligono, subpoligono opcional, canales, dia de visita y ventana horaria.
- Si no se selecciona dia de visita, incluir todos los clientes que cumplan los demas filtros.
- Si no se selecciona subpoligono, usar todo el poligono padre.
- Evitar planes incompletos: si falta configuracion geografica o no se pueden generar stops, devolver un error claro para avisar al administrador.

## No objetivos

- No borrar rutas, planes ni stops historicos.
- No generar stops desde la PWA mediante escrituras genericas ORM.
- No permitir subpoligonos fuera del poligono padre.
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

## Datos de cliente

Los clientes deben tener campos suficientes para filtrar visitas:

- ubicacion geografica usable para evaluacion contra poligono/subpoligono;
- canal o canales comerciales;
- dia o dias de visita;
- ventana horaria preferente o permitida.

Los nombres de campos finales deben confirmarse contra los modelos reales de Odoo antes de implementar. Si no existen, Odoo debe agregarlos y definir una migracion/correccion de datos.

Regla de dia:

- Si Supervisor de Ventas selecciona uno o mas dias, solo entran clientes configurados para esos dias.
- Si no selecciona ningun dia, entran todos los clientes que cumplan poligono/subpoligono/canales, sin filtrar por dia.

## Ventanas horarias

Debe existir un catalogo configurable de ventanas horarias. Nombre tecnico propuesto: `gf.route.time.window`.

Valores iniciales:

- Manana.
- Tarde.

Reglas:

- Administracion puede agregar mas ventanas.
- Cada cliente puede tener una ventana preferente o permitida, segun el modelo final acordado.
- En planeacion, Supervisor de Ventas puede filtrar por una ventana.
- Si no selecciona ventana, no se aplica filtro por ventana.

## Flujo PWA de Supervisor de Ventas

La pantalla de planeacion diaria debe pedir:

1. Ruta/chofer: `gf.route`.
2. Poligono padre.
3. Subpoligono: lista filtrada por poligono padre, mas opcion "Ninguno".
4. Canales: seleccion multiple.
5. Dia de visita: seleccion opcional; si queda vacio, entran todos.
6. Ventana horaria: seleccion opcional.
7. Forecast de productos.

Despues de capturar criterios y forecast, la PWA llama a un endpoint backend para asegurar/generar el plan.

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
- `time_window_id = null`: no filtrar por ventana.

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
- Agregar wrappers API para catalogos:
  - poligonos;
  - subpoligonos por poligono;
  - canales;
  - ventanas horarias.
- Extender `ensureDailyRoutePlan(routeId, dateTarget)` para enviar criterios de planeacion.
- Mostrar errores funcionales del backend sin degradarlos a "Error al crear plan".
- Bloquear guardado/confirmacion de forecast si el plan no pudo generar stops.
- Actualizar `ScreenAceptarCarga.jsx` para reflejar `plan.state = in_progress` tras `acceptLoad`.
- Agregar accion de archivar ruta en pantalla administrativa o modulo definido para administradores.

## Cambios Odoo necesarios

- Confirmar/agregar `active` en `gf.route`.
- Agregar modelo de subpoligono y validacion geometrica contra poligono padre.
- Agregar o confirmar campos de cliente para canal, dias de visita y ventana horaria.
- Agregar catalogo de ventanas horarias.
- Actualizar `route_plan/ensure` para:
  - validar permisos, CEDIS y compania;
  - crear o reutilizar `gf.route.plan`;
  - asociar poligono/subpoligono;
  - resolver clientes por filtros;
  - generar `gf.route.stop`;
  - devolver conteos y errores funcionales.
- Actualizar `accept-load` para garantizar `state = in_progress`.

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

## Preguntas abiertas

- Nombre tecnico real del modelo de poligonos actual.
- Campos actuales de cliente para canal, dias de visita y ventana horaria.
- Si canal debe ser obligatorio o puede quedar vacio para incluir todos.
- Si una ventana horaria puede ser many2many en clientes o solo una preferente.
- Donde debe vivir la accion de archivar rutas en PWA: admin general, supervisor ventas o una pantalla nueva de configuracion logistica.
