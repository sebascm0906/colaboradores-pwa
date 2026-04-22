/* ============================================================================
   Fallback de razones de merma para producción (gf.production.scrap.reason).

   Fuente en runtime: /pwa-prod/scrap-reasons (ver modules/produccion/api.js).
   Este archivo solo se usa cuando la API falla o devuelve lista vacía.

   IDs se mantienen exactamente iguales a los que se usaban como fallback
   hardcoded en ScreenIncidenciaRolito.jsx antes del refactor.

   Aliases se documentan para uso futuro (prompt W120 con hints explícitos).
   Hoy NO se consumen en runtime — viven aquí como fuente de verdad.
============================================================================ */

/** @type {import('./_shape.js').CatalogEntry[]} */
export const SCRAP_REASONS_PRODUCTION = [
  {
    id: 1,
    label: 'Derretido',
    aliases: ['derret', 'derretido', 'derretida', 'se derritio', 'se derretio', 'derritio'],
    metadata: { llm_enum: 'derretimiento', icon: '\uD83D\uDCC9' },
  },
  {
    id: 2,
    label: 'Roto',
    aliases: ['roto', 'rota', 'quebrado', 'quebrada', 'partido', 'dañado', 'danado'],
    metadata: { llm_enum: 'golpe', icon: '\u274C' },
  },
  {
    id: 3,
    label: 'Sellado deficiente',
    aliases: ['sellado', 'mal sellado', 'sellado malo', 'fuga', 'fugando'],
    metadata: { icon: '\u26A0' },
  },
]

/** @type {import('./_shape.js').Catalog} */
export const scrapReasonsProductionCatalog = {
  id: 'scrap_reasons_production',
  version: '1.0.0',
  entries: SCRAP_REASONS_PRODUCTION,
}
