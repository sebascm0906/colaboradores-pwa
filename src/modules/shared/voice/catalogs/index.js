/* ============================================================================
   Barrel export — catálogos compartidos para voice-to-form.

   Regla: estos archivos son FALLBACKS. La fuente de verdad en runtime son los
   endpoints de Odoo. Cuando la API falla o devuelve lista vacía, las screens
   consumen desde aquí.

   Convención de naming:
     <DOMINIO>_<CONTEXTO> — constante exportada con la lista (array)
     <dominioContexto>Catalog — objeto Catalog con {id, version, entries}

   Ver _shape.js para CatalogEntry y Catalog.
============================================================================ */

export { SCRAP_REASONS_PRODUCTION, scrapReasonsProductionCatalog } from './scrapReasons.catalog.js'
export { DOWNTIME_CATEGORIES_PRODUCTION, downtimeCategoriesProductionCatalog } from './downtimeCategories.catalog.js'
export { CATALOG_SHAPE_VERSION } from './_shape.js'
