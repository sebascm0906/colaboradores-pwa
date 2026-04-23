/* ============================================================================
   Catálogo de razones de merma para almacén de Producto Terminado (PT).

   Distinto del catálogo de produccion (gf.production.scrap.reason): el módulo
   almacen_pt registra mermas sobre inventario ya terminado (stock.quant), no
   sobre linea en proceso. Los `tag` ids aqui son los mismos que el endpoint
   /gf/logistics/api/employee/warehouse_scrap/create espera (confirmados por
   Sebastián audit 2026-04-10 — ver comentario en ScreenMermaPT.jsx).

   Aliases se envian al LLM (W120 context_id=almacen_pt_merma) para matching
   robusto por modismos del almacenista.
============================================================================ */

/** @type {import('./_shape.js').CatalogEntry[]} */
export const PT_SCRAP_REASONS = [
  {
    id: 'damage',
    label: 'Roto / dañado',
    aliases: ['roto', 'rota', 'dañado', 'danado', 'daño', 'rotura', 'golpeado', 'quebrado', 'partido', 'estrellado', 'maltratado'],
    metadata: { icon: '\u274C' },
  },
  {
    id: 'expired',
    label: 'Caducado',
    aliases: ['caducado', 'caducada', 'vencido', 'vencida', 'caduco', 'expirado', 'caducidad', 'fecha vencida', 'paso de fecha'],
    metadata: { icon: '\u23F3' },
  },
  {
    id: 'shortage',
    label: 'Faltante',
    aliases: ['faltante', 'falta', 'faltan', 'falto', 'incompleto', 'incompleta', 'corto', 'corta', 'menos', 'menor', 'no aparece'],
    metadata: { icon: '\u26A0' },
  },
  {
    id: 'contamination',
    label: 'Contaminado',
    aliases: ['contaminado', 'contaminada', 'contaminacion', 'sucio', 'sucia', 'mugre', 'plaga', 'plagas', 'manchado', 'con basura', 'con tierra'],
    metadata: { icon: '\uD83E\uDDB7' },
  },
  {
    id: 'other',
    label: 'Otro',
    aliases: ['otro', 'otra', 'otros', 'otra cosa', 'otra razon', 'otro motivo'],
    metadata: { icon: '\u2753' },
  },
]

/** @type {import('./_shape.js').Catalog} */
export const ptScrapReasonsCatalog = {
  id: 'scrap_reasons_almacen_pt',
  version: '1.0.0',
  entries: PT_SCRAP_REASONS,
}
