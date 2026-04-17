// lineService.js — Consolidacion Fase 11
// Servicio centralizado de lineas de produccion.
//
// ENDPOINT: Odoo controller real → GET /api/production/lines
// CONTRATO CANONICO: [{ id, name, type, plant }]
// FALLBACK: lista estatica si el endpoint no responde.
//
// Consumido por: ScreenParos.

import { getLines as getLinesAPI } from './productionAPI'

const FALLBACK_LINES = [
  { id: 1, name: 'Barras', type: '', plant: null },
  { id: 2, name: 'Rolito', type: '', plant: null },
]

let _cache = null
let _cacheTs = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 min

/**
 * Obtiene lista de lineas. Intenta backend, fallback a lista estatica.
 * Cache en memoria de 5 min.
 * Retorna shape canonico: [{ id, name, type, plant }]
 *
 * @returns {Promise<Array<{id: number, name: string, type: string, plant: object|null}>>}
 */
export async function loadLines() {
  const now = Date.now()
  if (_cache && (now - _cacheTs) < CACHE_TTL) return _cache

  try {
    const result = await getLinesAPI()
    if (Array.isArray(result) && result.length > 0) {
      _cache = result
      _cacheTs = now
      return result
    }
  } catch {
    // endpoint no disponible — usar fallback
  }

  return FALLBACK_LINES
}

/**
 * Indica si la ultima carga vino del backend o del fallback.
 */
export function isLinesFallback() {
  return !_cache
}

/**
 * Limpia cache (forzar recarga en proximo request).
 */
export function clearLinesCache() {
  _cache = null
  _cacheTs = 0
}
