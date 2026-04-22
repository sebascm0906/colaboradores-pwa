/* ============================================================================
   Fallback de categorías de paro de producción (gf.production.downtime.category).

   Fuente en runtime: /pwa-prod/downtime-categories (ver modules/produccion/api.js).
   Este archivo solo se usa cuando la API falla o devuelve lista vacía.

   IDs se mantienen exactamente iguales a los que se usaban como fallback
   hardcoded en ScreenIncidenciaRolito.jsx antes del refactor.

   Aliases se documentan para uso futuro (prompt W120 con hints explícitos).
   Hoy NO se consumen en runtime — viven aquí como fuente de verdad.
============================================================================ */

/** @type {import('./_shape.js').CatalogEntry[]} */
export const DOWNTIME_CATEGORIES_PRODUCTION = [
  {
    id: 1,
    label: 'Falta de agua',
    aliases: ['agua', 'falta de agua', 'sin agua', 'no hay agua', 'se fue el agua'],
    metadata: { icon: '\uD83D\uDCA7' },
  },
  {
    id: 2,
    label: 'Corte de energia',
    aliases: ['energia', 'corte de energia', 'luz', 'sin luz', 'se fue la luz', 'electrica', 'corte electrico'],
    metadata: { icon: '\u26A1' },
  },
  {
    id: 3,
    label: 'Falla de maquina',
    aliases: ['maquina', 'falla', 'falla mecanica', 'se descompuso', 'equipo fallo', 'descompuesta'],
    metadata: { icon: '\u2699' },
  },
  {
    id: 4,
    label: 'Paro por calidad',
    aliases: ['calidad', 'paro calidad', 'problema calidad', 'falla calidad'],
    metadata: {},
  },
]

/** @type {import('./_shape.js').Catalog} */
export const downtimeCategoriesProductionCatalog = {
  id: 'downtime_categories_production',
  version: '1.0.0',
  entries: DOWNTIME_CATEGORIES_PRODUCTION,
}
