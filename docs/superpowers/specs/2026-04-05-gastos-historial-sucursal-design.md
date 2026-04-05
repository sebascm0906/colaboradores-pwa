# Historial de Gastos por Sucursal

## Contexto
La app ya permite que administracion y gerencia registren gastos desde la PWA. Falta una pantalla de consulta para que la administradora de sucursal vea los gastos capturados por sucursal con filtros, sin mezclar esa vista con el formulario de alta.

## Objetivo
Construir una pantalla de solo lectura para consultar gastos por sucursal con filtros de:
- sucursal
- rango de fechas
- capturista
- estado
- texto libre

La pantalla debe mostrar únicamente los gastos visibles para el usuario autenticado y su contexto de sucursal.

## Alcance
Incluye:
- nueva ruta de historial de gastos
- acceso desde `Admin Sucursal`
- listado con totales visibles
- filtros combinables
- consulta directa a Odoo para evitar dependencias de n8n

No incluye:
- edición o eliminación de gastos
- flujo de aprobación
- cambios al formulario de alta
- cambios al login o a la sesión

## UX Propuesta
La pantalla tendrá:
- encabezado con regreso al panel de admin
- bloque de filtros
- tarjetas de resumen con conteo y total filtrado
- lista de gastos en formato compacto

Cada fila mostrará:
- fecha
- descripción o nombre
- monto
- sucursal/empresa
- capturista
- estado

## Filtros
Filtros iniciales:
- `sucursal` o empresa
- `fecha inicio`
- `fecha fin`
- `capturista`
- `estado`
- búsqueda por texto en nombre/descripcion

Comportamiento:
- los filtros combinan en AND
- si no se selecciona sucursal, se usa la sucursal de la sesión cuando exista
- si no se selecciona capturista, se muestran todos los de la sucursal
- el rango por defecto será “hoy”

## Fuente de datos
La fuente será `hr.expense` en Odoo, usando un endpoint directo desde la capa `src/lib/api.js`.

El endpoint deberá devolver:
- `id`
- `name`
- `description`
- `date`
- `total_amount`
- `state`
- `company_id`
- `employee_id`
- `account_id`

La consulta debe permitir filtrar por:
- `company_id`
- `date`
- `employee_id`
- `state`
- texto libre sobre `name` y `description`

## Integración en la App
- agregar una acción nueva en `Admin Sucursal`
- crear una pantalla nueva de historial
- reutilizar el patrón visual existente en admin/gerente
- mantener el formulario de alta aparte

## Criterios de Aceptación
- la administradora puede abrir una pantalla dedicada de historial
- la lista muestra sólo gastos de la sucursal filtrada
- puede filtrar por capturista, fecha, estado y texto
- la vista no dispara logout ni usa n8n para consultar gastos
- la pantalla funciona con la sesión actual y respeta la compañía del usuario

## Riesgos
- la compañía del gasto puede no coincidir con el usuario si el backend no normaliza `company_id`
- algunos gastos antiguos podrían tener descripciones vacías o cuentas obsoletas
- si Odoo bloquea la lectura por dominio, habrá que ajustar el endpoint directo con `sudo=1` y filtros estrictos por compañía

## Verificación
- abrir `Admin Sucursal`
- entrar al historial de gastos
- verificar que carga sin expulsar la sesión
- probar filtros por fecha, sucursal y capturista
- validar que el total filtrado coincide con los registros visibles
