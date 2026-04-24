# Cierre de Supervisión con Conteo Obligatorio y Relevo de Almacén PT

## Contexto
Hoy el cierre de turno del supervisor de producción vive en la PWA de supervisión y se apoya en validaciones backend-first de readiness para poder ejecutar el cierre del turno. En paralelo, Almacén PT ya cuenta con un flujo propio de entrega y aceptación de turno entre almacenistas, basado en un handover con inventario y aceptación posterior.

El problema es que ambos procesos hoy están desacoplados:
- el supervisor puede cerrar su turno sin forzar un corte formal de custodia en PT
- el almacenista de PT puede operar sin que exista un conteo obligatorio al momento del cierre operativo
- no queda una cadena completa y obligatoria de:
  - cierre del supervisor
  - conteo total de PT
  - aceptación del siguiente almacenista
  - reapertura de PT con nuevo responsable

Adicionalmente, el negocio requiere que este corte:
- ocurra cuando el turno del supervisor ya esté cerrado
- cierre también la operación de PT mientras se realiza el conteo y la aceptación
- no se trate como paro ni congele artificialmente los tiempos de producción
- permita que cualquier almacenista PT autorizado tome el relevo, sin preasignación

## Objetivo
Convertir el cierre del supervisor en el disparador de un relevo obligatorio de Almacén PT, de forma que:
- al cerrar el supervisor se genere automáticamente una entrega de turno PT pendiente
- el almacenista saliente capture un conteo total del inventario PT
- cualquier almacenista PT autorizado pueda aceptar el relevo
- PT permanezca bloqueado para movimientos hasta que el relevo sea aceptado
- la aceptación deje trazabilidad completa y reabra PT con nuevo custodio operativo

## Alcance
Incluye:
- disparar un handover PT obligatorio después del cierre del supervisor
- exigir conteo total de todo el inventario PT
- bloquear movimientos operativos de PT mientras el handover esté pendiente
- permitir aceptación por cualquier usuario con rol efectivo `almacenista_pt`
- dejar registro de entrega, aceptación, diferencias y notas
- reabrir PT con nuevo responsable al aceptar el relevo

No incluye:
- bloquear o alterar los tiempos de producción como si fuera paro
- meter el conteo PT como prerequisito previo al cierre del supervisor
- preasignar al almacenista entrante
- rediseñar por completo las pantallas de supervisión o PT fuera de este flujo
- cambiar el modelo conceptual del cierre de operadores barra o rolito

## Decisión de Diseño
Se reutilizará el flujo existente de handover de PT como base del nuevo proceso obligatorio, en lugar de crear un flujo nuevo independiente.

La decisión es:
- el supervisor cierra su turno como hoy
- el backend, al confirmar ese cierre, genera un handover PT pendiente
- PT entra en estado operativo cerrado para movimientos
- el almacenista saliente declara el inventario total
- un almacenista PT autorizado acepta, acepta con diferencias o disputa
- al aceptar, PT se reabre bajo el nuevo custodio

Esto evita duplicar conceptos ya presentes en la aplicación y concentra la autoridad real del proceso en backend.

## Reglas de Negocio

### Secuencia obligatoria
El flujo aprobado queda así:
1. supervisor cierra turno
2. sistema genera handover PT pendiente
3. PT queda bloqueado para movimientos
4. almacenista saliente realiza conteo total
5. almacenista entrante acepta o disputa
6. al aceptar, PT se reabre

### Momento del conteo
- el conteo PT ocurre después del cierre del supervisor
- no debe pedirse como blocker previo en readiness de cierre del supervisor
- si el cierre del supervisor no se concreta, no debe existir handover PT post-cierre

### Alcance del conteo
- el conteo debe cubrir todo el inventario físico de PT
- no se limita al producto producido o recibido durante el turno
- la base de captura debe partir del inventario canónico actual de PT

### Custodia y aceptación
- no hay almacenista entrante preasignado
- cualquier usuario con rol efectivo `almacenista_pt` puede aceptar el handover pendiente
- la aceptación puede ser:
  - conforme
  - con diferencias
  - disputada

### Bloqueo operativo
Mientras exista un handover PT pendiente:
- no se permiten nuevos movimientos de PT
- se deben bloquear al menos:
  - recepción PT
  - transformación PT
  - traspaso PT
  - merma PT
  - cualquier posting o movimiento que altere inventario PT

### Tiempos de producción
- esta ventana no debe registrarse como paro
- no debe alterar ni congelar artificialmente los tiempos operativos de producción
- el cierre y reapertura de PT se tratan como relevo de custodia, no como evento de downtime

## Estado Operativo Propuesto
Se requiere formalizar un estado intermedio de PT equivalente a `handover_pending`.

Semántica:
- `open`: PT puede operar normalmente
- `handover_pending`: PT está en relevo y no puede registrar movimientos
- `reopened` o equivalente operacional: PT vuelve a quedar habilitado tras la aceptación

No es indispensable exponer esos nombres exactos en UI, pero sí un contrato backend claro que permita:
- saber si PT está bloqueado
- saber si existe un handover pendiente
- saber si la reapertura ya ocurrió

## UX Propuesta

### Supervisión
En el cierre del supervisor:
- el usuario cierra el turno desde `Control de Turno`
- si el cierre es exitoso, la UI debe informar que:
  - el turno del supervisor quedó cerrado
  - se generó un relevo pendiente en PT
  - PT permanecerá bloqueado hasta que otro almacenista lo acepte

No se debe pedir al supervisor capturar inventario PT en su propia pantalla.

### PT - Entrega
La pantalla de handover PT debe pasar de flujo opcional a flujo obligatorio post-cierre.

Debe mostrar:
- banner claro de “PT cerrado por relevo pendiente”
- lista total del inventario PT
- cantidad sistema
- cantidad declarada
- diferencia por línea
- nota obligatoria cuando la diferencia supere la tolerancia definida
- identificación del handover vinculado al cierre más reciente

### PT - Aceptación
Cuando exista handover pendiente:
- cualquier almacenista PT autorizado debe poder abrir la pantalla de aceptación
- debe ver el inventario declarado por el saliente
- debe capturar aceptación por línea o total según el flujo actual extendido
- debe dejar notas cuando acepte con diferencia o dispute

### Estado bloqueado
En cualquier pantalla PT que intente operar inventario mientras el handover siga pendiente:
- debe mostrarse mensaje de bloqueo operativo
- no deben mostrarse acciones habilitadas por simple UX local
- el backend debe rechazar la acción incluso si la UI no alcanzó a refrescar

## Reutilización de Componentes Existentes
La solución debe apoyarse en los componentes y servicios existentes:
- `src/modules/supervision/ScreenControlTurno.jsx`
- `src/modules/shared/supervisorAuth.js`
- `src/modules/shared/shiftReadiness.js`
- `src/modules/almacen-pt/ScreenHandoverPT.jsx`
- `src/modules/almacen-pt/ptService.js`
- `src/lib/api.js`

Principios:
- no duplicar el flujo de handover PT en otra pantalla
- no introducir lógica de autorización o bloqueo solo en frontend
- reutilizar el inventario PT canónico ya disponible como base del conteo

## Contrato Técnico Esperado

### Cierre supervisor
El cierre de supervisor debe evolucionar de:
- “cerrar turno y terminar”

a:
- “cerrar turno y orquestar creación de handover PT pendiente”

Idealmente el backend debe devolver algo conceptualmente equivalente a:

```json
{
  "ok": true,
  "shift_closed": true,
  "pt_handover_created": true,
  "pt_handover_id": 456,
  "pt_status": "handover_pending"
}
```

### Handover PT pendiente
El backend debe poder resolver:
- si existe handover pendiente para el almacén
- qué turno de supervisor lo originó
- quién lo creó
- qué snapshot o líneas base de inventario contiene
- si ya fue aceptado o disputado

### Bloqueo transversal PT
Los endpoints PT que alteran inventario deben validar una regla transversal:
- si existe handover pendiente, rechazar la operación

El error debe ser semántico y claro, por ejemplo:
- `PT_BLOCKED_BY_HANDOVER`
- mensaje legible para operador

### Reapertura
La aceptación exitosa del handover debe:
- marcar el handover como aceptado
- registrar al aceptante
- liberar el bloqueo de PT
- dejar listo el siguiente tramo operativo de PT

## Impacto Técnico Esperado

### Backend
- orquestar creación automática del handover PT al cerrar supervisor
- agregar bandera o estado consultable de bloqueo PT
- endurecer todos los endpoints PT que generan movimientos para respetar el bloqueo
- guardar trazabilidad de:
  - supervisor que detonó el cierre
  - almacenista que entrega
  - almacenista que acepta
  - diferencias
  - notas
  - timestamps

### PWA - Supervisión
- actualizar `ScreenControlTurno.jsx` para reflejar que el cierre dispara relevo PT
- adaptar `supervisorAuth.closeShiftServerSide()` al nuevo contrato si cambia la respuesta

### PWA - PT
- adaptar `ScreenHandoverPT.jsx` para distinguir:
  - handover manual existente
  - handover obligatorio post-cierre
- mostrar estado bloqueado en las pantallas PT sensibles
- endurecer servicios de PT para propagar errores de bloqueo de forma legible

## Manejo de Errores

### Si falla el cierre del supervisor
- no debe crearse handover PT
- PT no debe entrar en bloqueo post-cierre

### Si cierra el supervisor pero falla la creación del handover PT
- el sistema no debe quedar en estado ambiguo
- se requiere transaccionalidad o compensación backend
- preferentemente: si no se puede crear el handover PT obligatorio, el cierre completo debe considerarse fallido

### Si existe handover pendiente y alguien intenta mover PT
- la operación debe rechazarse en backend
- la UI debe mostrar mensaje claro de que PT está cerrado por relevo pendiente

### Si el aceptante disputa
- PT debe seguir bloqueado hasta que el caso se resuelva según la política definida en backend
- la disputa no debe equivaler a reapertura automática

## Criterios de Aceptación
- al cerrar el supervisor se genera automáticamente un handover PT pendiente
- ese handover queda ligado al cierre operativo que lo originó
- el conteo obligatorio cubre todo el inventario PT
- mientras el handover esté pendiente, PT no puede registrar movimientos
- cualquier `almacenista_pt` autorizado puede aceptar el handover pendiente
- la aceptación deja registro de usuario, fecha, diferencias y notas
- al aceptar el handover, PT se reabre y vuelve a operar
- este proceso no se registra como paro ni altera artificialmente tiempos de producción

## Riesgos
- hoy el handover PT puede estar pensado como flujo manual; endurecerlo a obligatorio puede requerir separar claramente handovers normales de handovers post-cierre
- si algún endpoint PT queda sin validar el estado de bloqueo, habrá inconsistencias operativas
- si el cierre supervisor y la creación del handover PT no son transaccionales, puede quedar un estado parcialmente cerrado
- si la disputa no tiene resolución bien definida, PT puede quedar bloqueado sin salida operacional clara

## Verificación
- cerrar turno de supervisor y validar que nace handover PT pendiente
- validar que PT muestra estado bloqueado inmediatamente después del cierre
- intentar registrar recepción, merma, transformación y traspaso con handover pendiente y confirmar rechazo
- capturar conteo total de inventario PT
- aceptar handover con otro almacenista PT autorizado
- validar que PT vuelve a operar después de la aceptación
- aceptar con diferencias y confirmar trazabilidad
- disputar handover y validar que PT siga bloqueado
