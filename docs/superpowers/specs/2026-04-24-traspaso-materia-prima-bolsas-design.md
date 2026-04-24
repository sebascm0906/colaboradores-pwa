# Traspaso de Materia Prima y Validación de Bolsas por Sucursal

## Contexto
Hoy la PWA expone desde administración un acceso llamado `Salida a Rolito` que abre el flujo de materiales en [ScreenMaterialesCrearIssue.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/almacen-pt/ScreenMaterialesCrearIssue.jsx). Ese flujo actual está modelado como entrega de material al turno usando `shift_id + line_id + material_id + qty_issued`.

Ese diseño ya no alcanza para la operación requerida porque el negocio necesita:
- que el acceso deje de estar sesgado a rolito
- limitar los destinos a solo dos opciones operativas
- configurar esos destinos desde la UI de Odoo por sucursal o almacén
- controlar la entrega y devolución de bolsas con validación cruzada con la gerente
- registrar diferencias económicas por faltantes de bolsas y cargar el adeudo al trabajador responsable

Además, el caso de uso ya no es simétrico entre líneas:
- para `operador_rolito`, la validación de bolsas es entre gerente y operador
- para la otra línea, la validación de bolsas es entre gerente y `almacenista_pt`

## Objetivo
Implementar un flujo de `TRASPASO MATERIA PRIMA` y un flujo de custodia de bolsas que:
- muestren solo dos destinos configurables por sucursal
- tomen la configuración de destinos desde Odoo
- permitan a la gerente entregar materia prima y bolsas al destino elegido
- permitan al trabajador destinatario devolver y declarar bolsas al cierre
- permitan a la gerente validar esa devolución
- registren diferencias sin bloquear el cierre
- calculen el costo del faltante por bolsa
- generen un registro de adeudo para el trabajador cuando falten bolsas

## Alcance
Incluye:
- renombrar el acceso de administración a `TRASPASO MATERIA PRIMA`
- reemplazar el modelo libre de línea por dos destinos configurados
- configuración por sucursal o almacén desde Odoo
- entrega de materia prima a `rolito` o `almacenista_pt`
- entrega de bolsas por gerente a cada destino
- declaración de devolución de bolsas por el trabajador
- validación final de la gerente
- registro de diferencias y adeudo del trabajador
- lectura del costo por bolsa desde configuración de Odoo

No incluye:
- descuento automático en nómina
- asientos contables automáticos
- soporte a más de dos destinos en esta versión
- rediseño completo del módulo de materiales o de PT fuera de este flujo
- reconciliar bolsas usando solo lógica frontend

## Decisión de Diseño
Se separarán dos conceptos que hoy están mezclados:

1. `Traspaso de materia prima`
   Flujo operativo para mover material hacia uno de dos destinos válidos configurados por sucursal.

2. `Custodia de bolsas`
   Flujo de responsabilidad compartida entre gerente y trabajador, con trazabilidad de entrega, devolución, validación y faltante económico.

La decisión es no seguir modelando el nuevo caso solo como `line_id` libre en la PWA. En su lugar:
- Odoo será la fuente de verdad de la configuración de destinos
- la PWA consumirá esa configuración y solo mostrará dos opciones
- el backend resolverá el destino real en términos de almacén o ubicación interna
- la custodia de bolsas tendrá un registro propio, separado de la reconciliación simple actual del rolito

## Configuración en Odoo

### Unidad de configuración
La configuración debe vivir por sucursal o almacén operativo, usando como referencia el `stock.warehouse` de la sesión.

Aunque hoy el despliegue inicia en Iguala, el diseño debe quedar listo para múltiples sucursales, donde cada una tendrá ubicaciones internas equivalentes como:
- `PIGU/MP-IGUALA/MP-TURNO-BARRA`
- `PIGU/MP-IGUALA/MP-TURNO-ROLITO`

### Campos requeridos
Se recomienda que Odoo exponga en la UI de configuración, por warehouse:
- destino `rolito`
- destino `pt`
- producto o material que representa la bolsa
- costo por bolsa
- flag para crear adeudo automático por faltante

Los destinos deben apuntar a ubicaciones internas de stock, no a texto libre.

### Contrato esperado hacia la PWA
La PWA debe poder consultar algo conceptualmente equivalente a:

```json
{
  "warehouse_id": 89,
  "warehouse_name": "PIGU/MP-IGUALA",
  "material_dispatch": {
    "destinations": [
      {
        "key": "rolito",
        "label": "Rolito",
        "role": "operador_rolito",
        "location_id": 1001,
        "location_name": "PIGU/MP-IGUALA/MP-TURNO-ROLITO"
      },
      {
        "key": "pt",
        "label": "Almacenista PT",
        "role": "almacenista_pt",
        "location_id": 1002,
        "location_name": "PIGU/MP-IGUALA/MP-TURNO-BARRA"
      }
    ]
  },
  "bags_policy": {
    "product_id": 555,
    "product_name": "Bolsa MP",
    "unit_cost": 3.5,
    "auto_create_employee_debt": true
  }
}
```

La PWA no debe hardcodear nombres de ubicaciones más allá de mostrar lo que devuelva Odoo.

## Flujo de Traspaso de Materia Prima

### UI de administración
El acceso visible en admin debe cambiar de:
- `Salida a Rolito`

a:
- `TRASPASO MATERIA PRIMA`

La pantalla ya no debe pedir una línea libre. En su lugar debe mostrar solo dos destinos disponibles:
- `Rolito`
- `Almacenista PT`

Cada destino debe mostrar el nombre real de la ubicación configurada en Odoo.

### Comportamiento del traspaso
Cuando la gerente abra el flujo:
1. selecciona uno de los dos destinos
2. elige material
3. captura cantidad y notas
4. confirma el traspaso

El backend debe resolver el destino real usando la configuración del warehouse actual y crear el movimiento correspondiente.

### Restricción funcional
Si una sucursal no tiene configurado uno de los dos destinos:
- la opción debe mostrarse deshabilitada o no mostrarse
- la UI debe indicar que falta configuración de Odoo
- el backend debe rechazar cualquier intento manual de usar un destino no configurado

## Flujo de Custodia de Bolsas

### Pares de validación
Se formalizan dos pares válidos de custodia:
- `gerente_sucursal <-> operador_rolito`
- `gerente_sucursal <-> almacenista_pt`

No habrá validaciones cruzadas entre operador rolito y almacenista PT para este flujo.

### Ciclo operativo
Cada turno debe permitir este ciclo:
1. la gerente entrega bolsas al trabajador del destino
2. se registra cuántas bolsas fueron entregadas
3. el trabajador declara cuántas devuelve o le sobran al cierre
4. la gerente valida la devolución real
5. el sistema calcula diferencia
6. si hay faltante, calcula el costo y genera el adeudo del trabajador

### Estados propuestos
Cada registro de custodia de bolsas debe tener estados conceptuales:
- `draft`
- `issued`
- `declared_by_worker`
- `validated`
- `validated_with_difference`

No es obligatorio que esos sean los nombres exactos del modelo, pero la semántica sí debe existir.

## Modelo de Datos Propuesto

### Registro de custodia de bolsas
Se requiere un registro transaccional por turno y destino con al menos:
- `warehouse_id`
- `shift_id`
- `destination_key`
- `destination_role`
- `worker_employee_id`
- `manager_employee_id`
- `bags_issued`
- `bags_declared_by_worker`
- `bags_validated_by_manager`
- `difference_bags`
- `bag_unit_cost`
- `difference_amount`
- `worker_notes`
- `manager_notes`
- `state`
- `issued_at`
- `declared_at`
- `validated_at`

### Regla de cálculo
La diferencia monetaria debe calcularse como:

```text
faltante_bolsas = max(0, bags_issued - bags_validated_by_manager)
difference_amount = faltante_bolsas * bag_unit_cost
```

Si la diferencia resulta negativa o cero:
- no se genera adeudo
- la diferencia debe quedar registrada solo como dato operativo si aplica

### Registro de adeudo
Cuando haya faltante, Odoo debe crear un registro de adeudo al trabajador con:
- empleado responsable
- warehouse
- turno
- destino
- bolsas faltantes
- costo unitario
- monto total
- referencia al registro de custodia
- estado del adeudo

Este adeudo es operativo y auditable. No implica en esta fase descuento automático en nómina.

## UX Propuesta en la PWA

### Admin / Gerente
La gerente debe tener una pantalla unificada con dos acciones relacionadas:
- traspasar materia prima
- entregar bolsas

Para evitar confusión, el flujo principal puede arrancar con selección de destino y luego mostrar dos bloques:
- `Materia prima`
- `Bolsas`

La entrega de bolsas debe quedar explícitamente asociada al trabajador destino.

### Trabajador destino
El trabajador debe ver su registro pendiente de bolsas según su rol:
- `operador_rolito` ve su declaración de bolsas del turno
- `almacenista_pt` ve su declaración de bolsas del turno

La acción del trabajador es declarar devolución o sobrante, no validar la contabilidad final.

### Validación final de gerente
La gerente debe ver:
- entregado inicialmente
- declarado por trabajador
- validado físicamente por gerente
- diferencia
- monto del faltante

Si hay diferencia:
- se permite cerrar
- se exige nota de gerente o motivo
- se genera adeudo si la política lo indica

## Compatibilidad con el Flujo Actual

### Materiales
El flujo actual de `ScreenMaterialesCrearIssue.jsx` no debe seguir decidiendo el destino por selección libre de línea cuando el acceso provenga de administración para `TRASPASO MATERIA PRIMA`.

Se requiere una de estas dos evoluciones:
- extender el endpoint actual para aceptar `destination_key` y que backend resuelva ubicación
- crear un endpoint nuevo específico de traspaso configurado por sucursal

Se recomienda la segunda opción si el contrato actual basado en `line_id` ya no representa correctamente el negocio.

### Bolsas rolito
La reconciliación simple actual de `bags_received` y `bags_remaining` en cierre de rolito no es suficiente para este caso porque:
- solo captura al lado del operador
- no involucra a la gerente
- no calcula adeudo

Debe evolucionar a un flujo de custodia gerente-trabajador o integrarse a ese flujo sin duplicar registros.

## Contrato Técnico Esperado

### Configuración
Se necesita un endpoint de lectura de configuración por warehouse, por ejemplo:
- `GET /api/production/materials/dispatch-config?warehouse_id=N`

### Traspaso de materia prima
Se necesita un endpoint con semántica de destino configurado, por ejemplo:

```json
{
  "warehouse_id": 89,
  "destination_key": "pt",
  "material_id": 123,
  "qty_issued": 20,
  "issued_by": 77,
  "notes": "Entrega de turno"
}
```

### Custodia de bolsas
Se necesita al menos:
- crear entrega de bolsas por gerente
- declarar devolución por trabajador
- validar devolución por gerente
- consultar pendiente por turno o empleado

La respuesta de validación debe incluir:
- diferencia en bolsas
- costo unitario usado
- monto total
- si se creó adeudo

## Manejo de Errores

### Configuración faltante
Si no existe configuración de destinos o costo por bolsa:
- la PWA debe mostrar error claro
- no debe permitir continuar
- backend debe responder con error semántico como `DISPATCH_CONFIG_MISSING`

### Destino inválido
Si el cliente intenta usar un destino distinto a `rolito` o `pt`:
- backend debe rechazar la operación

### Validación con diferencia
Si la gerente valida con faltante:
- el cierre debe permitirse
- debe exigirse nota
- debe crearse el adeudo cuando corresponda

### Doble registro
Backend debe evitar:
- dos entregas activas de bolsas para el mismo turno y destino
- dos validaciones finales sobre el mismo registro

## Criterios de Aceptación
- administración muestra `TRASPASO MATERIA PRIMA` en lugar de `Salida a Rolito`
- la pantalla solo permite elegir entre `Rolito` y `Almacenista PT`
- los dos destinos provienen de configuración de Odoo por warehouse
- la gerente puede entregar materia prima al destino elegido
- la gerente puede entregar bolsas al trabajador destino
- el trabajador puede declarar devolución de bolsas
- la gerente puede validar la devolución aunque exista diferencia
- el sistema calcula el costo por bolsa usando la configuración vigente
- si faltan bolsas, el sistema genera un adeudo para el trabajador
- el adeudo queda ligado al turno, al warehouse y al registro de custodia

## Riesgos
- reutilizar el endpoint actual basado en `line_id` puede dejar ambigüedad entre línea operativa y ubicación real
- si el costo por bolsa cambia sin versionado, auditoría podría volverse confusa; el valor usado debe persistirse en el registro de validación
- si la selección del trabajador destino no queda bien resuelta en backend, la gerente podría entregar bolsas al rol correcto pero al empleado incorrecto
- si no se migra con cuidado la cuadratura actual de rolito, podrían coexistir dos fuentes de verdad

## Suposiciones
- el adeudo requerido es un registro operativo en Odoo, no un descuento automático en nómina
- cada warehouse tendrá solo dos destinos válidos para este flujo en esta fase
- `PIGU/MP-IGUALA/MP-TURNO-BARRA` y `PIGU/MP-IGUALA/MP-TURNO-ROLITO` son ejemplos de ubicaciones configurables, no constantes hardcodeadas

