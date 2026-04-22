/* ============================================================================
   Catálogo de tipos de incidente en tanques de salmuera (operador barra).

   Fuente en runtime: hardcoded en barraService.js como INCIDENT_TYPES.
   Este archivo es la fuente de verdad COMPARTIDA para voice-to-form:
   - W120 recibe este catálogo via metadata para que el LLM elija un id.
   - Frontend lo consume para matching fallback (matchByFuzzyName).

   IDs son strings (no numeric) porque INCIDENT_TYPES del backend los definió así.
   ScreenTanque sigue usando INCIDENT_TYPES de barraService para los botones del
   modal — este catálogo NO reemplaza eso (evita desync en UX mientras barra
   valida el piloto).

   Aliases se envían al LLM para mejorar matching por modismos de operador.
============================================================================ */

/** @type {import('./_shape.js').CatalogEntry[]} */
export const TANK_INCIDENTS = [
  {
    id: 'salt_low',
    label: 'Nivel de sal bajo',
    aliases: ['sal', 'sal baja', 'nivel sal', 'poca sal', 'sin sal', 'salmuera baja', 'bajo de sal'],
    metadata: { icon: '\u26A0' },
  },
  {
    id: 'temp_high',
    label: 'Temperatura alta',
    aliases: ['temperatura', 'temperatura alta', 'caliente', 'tanque caliente', 'muy caliente', 'temperatura arriba'],
    metadata: { icon: '\uD83C\uDF21' },
  },
  {
    id: 'leak',
    label: 'Fuga de salmuera',
    aliases: ['fuga', 'fuga de salmuera', 'derrame', 'gotea', 'esta goteando', 'salmuera fuera', 'derrame lateral'],
    metadata: { icon: '\uD83D\uDCA7' },
  },
  {
    id: 'mechanical',
    label: 'Falla mecanica',
    aliases: ['mecanica', 'falla mecanica', 'motor', 'bomba fallo', 'equipo fallo', 'mecanismo', 'se descompuso'],
    metadata: { icon: '\u2699' },
  },
  {
    id: 'other',
    label: 'Otro',
    aliases: ['otro', 'otros', 'otra cosa', 'otra incidencia'],
    metadata: { icon: '\u2753' },
  },
]

/** @type {import('./_shape.js').Catalog} */
export const tankIncidentsCatalog = {
  id: 'tank_incidents_barra',
  version: '1.0.0',
  entries: TANK_INCIDENTS,
}
