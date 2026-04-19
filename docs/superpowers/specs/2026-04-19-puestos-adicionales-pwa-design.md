# Puestos Adicionales en Empleados y Dashboard PWA

## Contexto
Hoy la PWA resuelve el acceso del colaborador a partir de un único `role` en sesión. Ese `role` controla:
- qué recuadros aparecen en Inicio
- qué rutas o acciones internas se muestran
- qué variante de algunos módulos compartidos se abre

El cambio requerido es permitir que un empleado tenga un puesto principal y además puestos adicionales configurados desde `hr.employee`, sin romper el comportamiento actual para empleados que no tengan puestos extra.

## Objetivo
Permitir que un empleado reciba permisos completos de uno o más puestos adicionales, de forma que:
- vea los módulos correspondientes en el dashboard
- pueda navegar y operar esos módulos
- mantenga su puesto principal actual
- resuelva explícitamente con qué puesto abrir un módulo cuando una misma ruta soporte variantes por puesto

## Alcance
Incluye:
- nueva sección `Puestos adicionales` en `hr.employee`
- booleanos en Odoo alineados con los roles reales de la PWA
- traducción de esos booleanos a `additional_roles` en el payload de login/sesión
- soporte en la PWA para `role` principal + `additional_roles`
- visibilidad de módulos en Inicio con roles efectivos
- permisos funcionales usando roles efectivos
- selector de puesto al entrar a módulos compartidos cuando exista conflicto

No incluye:
- sistema granular de permisos por tarea
- duplicar tarjetas del home por cada puesto
- reemplazar el puesto principal del empleado
- rediseño amplio de navegación fuera de los puntos afectados

## Decisión de Diseño
Se usará el modelo:
- `role` principal como hoy
- `additional_roles` como arreglo derivado desde Odoo

Los booleanos viven en Odoo porque son la configuración editable del empleado. La PWA no interpreta booleanos individuales; consume una lista normalizada de roles adicionales usando las mismas claves de rol que ya existen en el código.

Esto evita inventar otra capa de permisos y permite reutilizar la lógica actual basada en roles.

## Mapeo Funcional
La fuente de verdad para el mapeo serán los roles ya existentes en la PWA. Los booleanos de Odoo deben corresponder a roles activos del sistema, por ejemplo:
- `operador_barra`
- `operador_rolito`
- `auxiliar_produccion`
- `supervisor_produccion`
- `almacenista_pt`
- `jefe_ruta`
- `auxiliar_ruta`
- `almacenista_entregas`
- `supervisor_ventas`
- `auxiliar_admin`
- `gerente_sucursal`
- `operador_torres`

Si algún rol no debe poder ser puesto adicional por decisión del negocio, eso se define del lado de Odoo al construir la sección de booleanos. La PWA solo consumirá las claves que reciba.

## Contrato Odoo -> PWA
El login y cualquier endpoint de sesión que alimente la PWA deben seguir enviando:
- `role`

Y además enviar:
- `additional_roles: string[]`

Reglas:
- `additional_roles` no debe incluir el `role` principal
- debe llegar como arreglo vacío cuando no existan puestos adicionales
- si el backend aún no lo envía, la PWA debe comportarse como hoy

Ejemplo:

```json
{
  "role": "auxiliar_admin",
  "additional_roles": ["gerente_sucursal", "almacenista_pt"]
}
```

## Modelo de Acceso en la PWA
La PWA debe centralizar la resolución de acceso en helpers comunes:
- `getEffectiveRoles(session)` -> devuelve `role + additional_roles` sin duplicados
- `hasEffectiveRole(session, role)` -> valida si el usuario tiene un rol efectivo
- `getModulesForRoles(roles)` o equivalente -> devuelve módulos visibles sin duplicados

Reglas:
- si no hay `additional_roles`, el resultado debe ser idéntico al actual
- ninguna pantalla nueva debe depender solo de `session.role` para permisos generales
- los checks de UI y navegación deben usar el mismo helper central

## Dashboard / Inicio
El home seguirá mostrando una sola tarjeta por módulo.

Comportamiento:
- un módulo se muestra si cualquiera de los roles efectivos lo habilita
- si varios roles efectivos habilitan el mismo módulo, la tarjeta aparece una sola vez
- el orden de los módulos debe mantenerse estable

Esto aplica tanto al grid principal de Inicio como a menús internos que hoy filtran por `session.role`.

## Módulos Compartidos y Selector de Puesto
Hay rutas compartidas cuyo comportamiento cambia según el puesto, por ejemplo producción. En esos casos no se debe asumir automáticamente el puesto principal cuando existan varias variantes posibles.

Regla:
- si para una ruta existe un solo rol efectivo compatible, entra directo
- si para esa ruta existen varios roles efectivos compatibles y la pantalla cambia por puesto, la app debe mostrar un selector de puesto antes de entrar
- la elección aplica para esa navegación y puede conservarse como contexto temporal del flujo
- no se deben duplicar tarjetas en el home

El selector resuelve la variante del módulo, no cambia el `role` principal persistido en sesión.

## Contexto de Navegación
Para rutas compartidas, la navegación debe poder transportar un contexto de puesto seleccionado, por ejemplo:
- `selected_role`
- `active_role`
- nombre equivalente consistente con el código existente

Ese contexto debe usarse dentro del módulo para decidir qué variante cargar cuando haya conflicto. Si no existe contexto explícito, el módulo puede inferirlo solo cuando haya una única opción válida.

## Impacto Técnico Esperado
### Odoo
- extensión de `hr.employee` con booleanos de puestos adicionales
- actualización de la vista form de empleado para mostrar la sección `Puestos adicionales`
- serialización de esos booleanos a `additional_roles` en el endpoint o payload de login/sesión

### PWA
- aceptar `additional_roles` en la sesión construida desde login
- crear helpers de roles efectivos y resolución de acceso
- actualizar el registry/home para soportar múltiples roles efectivos
- reemplazar checks directos de `session.role` en módulos afectados por helpers comunes
- añadir selector de puesto en entradas de módulos compartidos

## Manejo de Errores y Compatibilidad
- si `additional_roles` falta o no es arreglo, tratarlo como `[]`
- si llega un rol desconocido, ignorarlo para visibilidad y navegación
- si un módulo compartido requiere elección y el usuario cancela, no se navega
- la ausencia de puestos adicionales no debe modificar la UX actual

## Criterios de Aceptación
- un empleado con solo puesto principal ve y usa la PWA igual que hoy
- un empleado con puestos adicionales ve los módulos correspondientes en Inicio
- esos puestos adicionales habilitan también la navegación interna y permisos funcionales
- un módulo no se duplica en el dashboard aunque varios roles lo habiliten
- si una misma ruta soporta varias variantes por puesto, el usuario puede elegir con cuál abrirla
- si solo existe una variante disponible para esa ruta, la entrada es directa

## Riesgos
- existen comparaciones directas de `session.role` dentro de pantallas; si alguna queda fuera, habrá permisos inconsistentes
- algunos módulos compartidos podrían requerir adaptar más de una pantalla para respetar el puesto elegido
- si Odoo envía claves de rol distintas a las usadas por la PWA, el acceso quedará desalineado

## Verificación
- login con usuario sin puestos adicionales
- login con usuario con varios puestos adicionales
- validar módulos visibles en Inicio sin duplicados
- validar acceso a pantallas internas habilitadas por un puesto adicional
- validar selector al entrar a rutas compartidas con más de un puesto compatible
- validar entrada directa cuando solo exista una variante posible
