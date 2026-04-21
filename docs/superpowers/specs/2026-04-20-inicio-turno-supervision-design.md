# Inicio de Turno en Dos Pasos para Supervisión

## Contexto
Hoy el flujo de `Control de Turno` permite abrir un turno desde la PWA, pero la creación actual solo genera un `gf.production.shift` en estado `draft`. No existe un paso explícito en la UI para cambiar el turno a `in_progress`, aunque el backend sí expone la acción `action_start_shift`.

Eso deja una ambigüedad operativa:
- el supervisor puede “abrir” el turno
- el turno sigue en borrador
- no hay una validación formal de prerequisitos antes de iniciar la operación

Al mismo tiempo, ya existen dos tipos de datos operativos relevantes:
- lectura inicial de energía, que es global al turno
- lecturas de salmuera por tanque, que son por tanque activo

## Objetivo
Convertir el arranque del turno en un flujo de dos pasos:
1. `Abrir turno` crea el turno en `draft`
2. `Iniciar turno` lo cambia a `in_progress` solo cuando se cumplan los prerequisitos operativos

Prerrequisitos aprobados:
- una lectura inicial de energía global
- lecturas de sal del día para todos los tanques de salmuera activos

## Alcance
Incluye:
- mantener `Abrir turno` como creación en `draft`
- agregar un bloque `Requisitos para iniciar` en `Control de Turno`
- mostrar estado de energía inicial global
- mostrar estado de salmuera para todos los tanques activos
- habilitar `Iniciar turno` solo cuando todo esté completo
- ejecutar `action_start_shift` desde la PWA

No incluye:
- cambiar el flujo de cierre de turno
- cambiar el significado de la lectura de energía final
- derivar salmuera desde HACCP
- cambiar el requisito de temperatura al cosechar

## Decisión de Diseño
Se mantiene un flujo de dos fases en [src/modules/supervision/ScreenControlTurno.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenControlTurno.jsx):
- `Abrir turno` crea el borrador
- `Iniciar turno` valida requisitos y ejecuta el arranque formal

El botón de inicio no debe estar disponible por defecto. La pantalla debe explicar de forma explícita qué falta antes de habilitarlo.

## Reglas de Negocio
### Apertura
- `Abrir turno` crea un turno en estado `draft`
- el turno sigue siendo visible y operable desde supervisión
- todavía no debe considerarse “en curso”

### Inicio
Para poder iniciar el turno, se requiere:
- una lectura inicial de energía global asociada al turno
- lecturas de sal del día en todos los tanques de salmuera activos

`Todos los tanques activos` significa todos los tanques de salmuera que el sistema devuelve como activos, no solo los que tengan producción visible en ese momento.

### Energía
- la lectura inicial de energía es global al turno
- debe reutilizar la misma fuente de datos que ya usa el módulo de energía
- solo se necesita una lectura inicial para habilitar el arranque

### Salmuera
- la lectura de sal es por tanque
- debe reutilizar el flujo ya implementado de registro por tanque
- la validación debe considerar la lectura como “del día” usando el mismo criterio local de fecha que ya usa el fix de salmuera

## UX Propuesta
En `Control de Turno`, cuando exista un turno en `draft`, la pantalla mostrará:
- estado actual del turno
- bloque `Requisitos para iniciar`

Dentro de ese bloque:
- una tarjeta o fila `Energía inicial`
- una lista de tanques con estado de lectura
- un resumen tipo checklist con estado visual claro

Acciones disponibles:
- `Registrar energía inicial`
- `Registrar sal` por cada tanque faltante o vencido
- `Iniciar turno`

Comportamiento:
- `Iniciar turno` permanece deshabilitado si falta cualquiera de los requisitos
- si el usuario intenta iniciar sin cumplirlos, la pantalla debe mostrar qué requisito bloquea
- si todo está listo, al iniciar se refresca el turno y su estado pasa a `En curso`

## Reutilización de Lógica
No se debe duplicar lógica operativa.

### Energía
La validación del requisito de energía debe reutilizar la misma fuente que hoy consume [src/modules/supervision/ScreenEnergia.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenEnergia.jsx) para lecturas del turno.

### Salmuera
La validación y el estado por tanque deben reutilizar:
- [src/modules/supervision/brineReadings.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/brineReadings.js)
- [src/modules/supervision/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/api.js)

Eso evita tener una lógica de “lectura válida” distinta en `Supervisión`, `Control de Turno` y `Producción`.

## Contrato Técnico Esperado
### Crear turno
Se conserva el comportamiento actual:
- `POST /pwa-sup/shift-create`
- crea el turno en `draft`

### Iniciar turno
Se requiere una acción nueva o expuesta en la PWA para:
- ejecutar `action_start_shift`
- devolver el turno actualizado o una confirmación de éxito

Ejemplo conceptual:

```json
{
  "shift_id": 123,
  "state": "in_progress"
}
```

## Estado de Readiness de Arranque
La pantalla debe derivar un estado de arranque, por ejemplo:
- `canStart`
- `blockers`
- `energyReady`
- `tankReadiness[]`

Ese estado debe ser calculado por un helper puro para que:
- la lógica sea testeable
- la pantalla no concentre toda la validación
- el mismo criterio pueda reutilizarse después si se quiere mostrar en dashboard

## Impacto Técnico Esperado
### UI
- actualizar [src/modules/supervision/ScreenControlTurno.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenControlTurno.jsx)
- posiblemente crear un helper puro para readiness de arranque
- posiblemente reutilizar la modal de salmuera o una integración breve desde Control de Turno

### API
- agregar llamada para iniciar turno en [src/modules/supervision/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/api.js)
- agregar passthrough local en [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js) que invoque `action_start_shift`

### Integración
- leer energía inicial asociada al turno
- leer tanques activos y su estado de salmuera
- reflejar cambios en tiempo real tras registrar energía o sal

## Manejo de Errores
- si falla la lectura de readiness, `Iniciar turno` no debe habilitarse por inferencia
- si falla `action_start_shift`, el turno debe permanecer en `draft` y mostrarse error claro
- si faltan datos backend de tanques o energía, la UI debe tratarlos como bloqueos, no como “completo”

## Criterios de Aceptación
- `Abrir turno` sigue creando el turno en `draft`
- `Control de Turno` muestra requisitos de inicio cuando el turno está en borrador
- no se puede iniciar turno sin lectura inicial de energía
- no se puede iniciar turno sin lectura del día en todos los tanques de salmuera activos
- al completar ambos requisitos, `Iniciar turno` queda habilitado
- al iniciar, el turno pasa a `in_progress`
- el estado visible del turno cambia de `Borrador` a `En curso`

## Riesgos
- hoy la PWA ya tolera operar con turnos en `draft`; al formalizar el arranque puede aparecer lógica antigua que asumía eso
- si el backend devuelve lecturas de energía con forma distinta según endpoint, habrá que unificar la interpretación
- si el listado de tanques activos incluye alguno fuera de operación real pero marcado activo, bloqueará el arranque por diseño

## Verificación
- abrir turno nuevo y confirmar que queda en `draft`
- validar que sin energía inicial `Iniciar turno` esté deshabilitado
- validar que con energía pero con un tanque sin lectura siga deshabilitado
- validar que con energía y todos los tanques completos se habilite
- iniciar turno y confirmar estado `in_progress`
- confirmar que la sal del día sigue respetando conversión a fecha local
