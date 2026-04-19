# Lecturas Diarias de Salmuera por Tanque

## Contexto
La cosecha de canastillas para barra ya depende de condiciones operativas del tanque en la PWA:
- nivel de sal del tanque
- fecha de la última lectura de sal
- temperatura de salmuera capturada al momento de cosechar

Hoy esa validación ya existe en producción, pero no hay un flujo claro en la PWA para que `supervisor_produccion` registre la lectura diaria de sal por tanque. Como resultado, el operador puede quedar bloqueado con mensajes como `Sin revisión de sal del día` aunque el sistema no le ofrezca al supervisor un lugar explícito para capturarla.

## Objetivo
Agregar un apartado en supervisión para registrar lecturas diarias de salmuera por tanque, de forma que:
- el supervisor pueda capturar el nivel de sal por tanque
- el sistema marque la lectura con fecha/hora
- la cosecha de barra use esa lectura como fuente de verdad para validar la condición diaria del tanque
- el operador de barra siga capturando la temperatura de salmuera al cosechar

## Alcance
Incluye:
- una interacción nueva dentro de `Supervisor Producción`
- registro por tanque, no global
- captura principal de `nivel de sal`
- captura opcional de `temperatura de salmuera` en el mismo registro
- refresco inmediato del estado visual del tanque tras guardar
- reutilizar la misma fuente de datos que hoy usa producción para validar cosecha

No incluye:
- reemplazar el checklist HACCP
- derivar automáticamente la lectura operativa desde HACCP
- eliminar la captura de temperatura durante la cosecha
- rediseñar las pantallas de tanque de operador barra

## Decisión de Diseño
Se usará una modal rápida dentro de [src/modules/supervision/ScreenSupervision.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenSupervision.jsx), abierta desde cada tarjeta de tanque.

Razones:
- la captura es corta y repetible
- el supervisor puede actualizar varios tanques sin abandonar supervisión
- se aprovecha la lista de tanques y alertas ya existente
- evita mezclar la operación del supervisor con la pantalla de cosecha del operador

## Modelo de Datos Operativo
La lectura del supervisor debe escribirse sobre la misma fuente que hoy consume producción para mostrar y validar el estado del tanque.

Campos operativos esperados:
- `x_salt_level`
- `x_salt_level_updated_at`
- opcionalmente `x_brine_temp_current`
- opcionalmente `x_brine_temp_updated_at`

La PWA ya lee estos datos a través de los endpoints de tanques y lectura de salmuera. Si falta un endpoint de escritura, deberá agregarse en el backend o en el passthrough local, pero el contrato funcional no cambia.

## Comportamiento en Supervisión
Cada tanque en supervisión seguirá mostrando:
- nombre del tanque
- canastillas listas
- temperatura actual
- nivel de sal actual
- alertas por lectura faltante o por debajo del mínimo

Y además tendrá una acción explícita tipo:
- `Registrar sal`

Al abrir la modal:
- se muestra el nombre del tanque
- se precarga la lectura actual si existe
- se permite capturar `nivel de sal`
- se permite capturar `temperatura de salmuera` como apoyo operativo
- al guardar, se registra la fecha/hora actual y se refresca la tarjeta

## Reglas de Validación
### Supervisor
- `nivel de sal` es obligatorio
- `nivel de sal` debe ser numérico y mayor que cero
- `temperatura de salmuera` puede ser opcional en esta primera versión

### Operador Barra
La cosecha mantiene su flujo actual:
- el operador sigue capturando la temperatura de salmuera al cosechar
- la validación de sal del día depende de la lectura registrada por supervisor
- si la lectura no es de hoy, la cosecha se bloquea
- si la sal está por debajo del mínimo del tanque, la cosecha se bloquea

Esto separa dos responsabilidades:
- supervisor: condición operativa diaria del tanque
- operador: temperatura puntual al momento de extracción

## Estado Visual del Tanque
La tarjeta del tanque debe reflejar claramente uno de estos estados:
- `sin lectura`
- `lectura vencida`
- `sal baja`
- `al día`

Estos estados ya existen parcialmente vía alertas; la nueva captura solo vuelve accionable ese estado dentro de supervisión.

## Relación con HACCP
El checklist HACCP sí guarda respuestas numéricas, pero hoy esas respuestas no alimentan de forma directa los campos operativos del tanque usados por cosecha.

Decisión:
- no depender del HACCP como fuente de verdad para salmuera operativa
- mantener HACCP como checklist
- mantener lecturas de tanque como registro operativo separado

Esto evita acoplar una validación de cosecha a un flujo que actualmente solo vive dentro del checklist.

## Impacto Técnico Esperado
### UI
- actualizar [src/modules/supervision/ScreenSupervision.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenSupervision.jsx) para incluir CTA por tanque y modal de captura
- crear un helper o componente pequeño para el formulario de lectura si ayuda a mantener la pantalla entendible

### API / Servicio
- agregar una llamada de escritura para registrar lectura de salmuera por tanque
- reutilizar el modelo de datos que hoy expone `salt_level`, `salt_level_updated_at`, `brine_temp` y umbrales

### Producción
- no cambiar la lógica central de cosecha
- solo asegurar que la lectura guardada por supervisor quede disponible en el mismo payload que ya consume barra

## Manejo de Errores
- si la escritura falla, la modal debe mostrar error y no cerrar
- si el refresco del tanque falla tras guardar, conservar confirmación pero advertir que no se pudo actualizar la vista
- si el backend aún no soporta escritura, no simular un guardado exitoso

## Criterios de Aceptación
- `supervisor_produccion` puede registrar nivel de sal por tanque desde supervisión
- el registro queda asociado al tanque correcto
- la lectura queda marcada con fecha/hora del guardado
- la tarjeta del tanque refleja la nueva lectura sin recargar toda la app
- una lectura de hoy y por encima del mínimo permite pasar la validación de sal en cosecha
- ausencia de lectura del día sigue bloqueando la cosecha
- el operador de barra sigue capturando temperatura al cosechar

## Riesgos
- puede no existir todavía un endpoint de escritura para actualizar el tanque
- si el backend guarda la temperatura operativa en otro campo distinto, habrá que alinear el contrato
- si la lógica de supervisión y producción usan formatos de fecha distintos, podría romperse la validación de “lectura de hoy”

## Verificación
- supervisor registra sal en un tanque sin lectura previa
- supervisor actualiza un tanque con lectura vencida
- supervisor registra un valor debajo del mínimo y la UI lo refleja
- operador barra intenta cosechar sin lectura del día y queda bloqueado
- operador barra intenta cosechar con lectura del día válida y puede continuar
- operador barra sigue capturando temperatura durante la cosecha
