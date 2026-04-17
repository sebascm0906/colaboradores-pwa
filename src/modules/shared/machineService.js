// machineService.js — Consolidacion Fase 11
// Servicio centralizado de maquinas de produccion.
//
// ENDPOINT: Odoo controller real → GET /api/production/machines
// CONTRATO CANONICO: [{ id, name, type, plant, line }]
//
// FALLBACK: lista estatica si el endpoint no responde.
// normalizeMachine() absorbe diferencias entre response canonico y legacy.
//
// Consumido por: ScreenParos.

import { getMachines as getMachinesAPI } from './productionAPI'

// ─── Fallback temporal ──────────────────────────────────────────────────────
// Lista minima de maquinas para que la UI no quede vacia si el endpoint
// /api/production/machines no responde. Se elimina cuando sea estable.
const FALLBACK_MACHINES = [
  { id: 1, name: 'Evaporador', type: 'evaporador', plant: null, line: null },
  { id: 2, name: 'Refinador', type: 'refinador', plant: null, line: null },
  { id: 3, name: 'Batidora', type: 'batidora', plant: null, line: null },
  { id: 4, name: 'Empacadora 1', type: 'empacadora', plant: null, line: null },
  { id: 5, name: 'Empacadora 2', type: 'empacadora', plant: null, line: null },
  { id: 6, name: 'Selladora', type: 'selladora', plant: null, line: null },
  { id: 7, name: 'Bascula', type: 'bascula', plant: null, line: null },
  { id: 8, name: 'Otro', type: 'other', plant: null, line: null },
]

let _cache = null
let _cacheTs = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 min

/**
 * Normaliza una maquina del backend al shape canonico.
 * Acepta tanto response canonico (type, plant, line) como legacy (machine_type).
 * TODO: eliminar branch legacy cuando el controller canonico este en 100%.
 *
 * @param {object} raw — maquina del backend
 * @returns {{ id: number, name: string, type: string, plant: object|null, line: object|null }}
 */
function normalizeMachine(raw) {
  return {
    id: raw.id,
    name: raw.name || raw.display_name || '',
    // Canonico: raw.type | Legacy: raw.machine_type
    type: raw.type || raw.machine_type || '',
    // Canonico: raw.plant (object) | Legacy: null
    plant: raw.plant || null,
    // Canonico: raw.line (object) | Legacy: line_id Many2one
    line: raw.line || (Array.isArray(raw.line_id) ? { id: raw.line_id[0], name: raw.line_id[1] } : null),
  }
}

/**
 * Obtiene lista de maquinas. Intenta backend, fallback a lista estatica.
 * Cache en memoria de 5 min para no bombardear el endpoint.
 * Retorna shape canonico: [{ id, name, type, plant, line }]
 *
 * @returns {Promise<Array<{id: number, name: string, type: string, plant: object|null, line: object|null}>>}
 */
export async function loadMachines() {
  const now = Date.now()
  if (_cache && (now - _cacheTs) < CACHE_TTL) return _cache

  try {
    const result = await getMachinesAPI()
    if (Array.isArray(result) && result.length > 0) {
      _cache = result.map(normalizeMachine)
      _cacheTs = now
      return _cache
    }
  } catch {
    // endpoint no disponible — usar fallback
  }

  return FALLBACK_MACHINES
}

/**
 * Indica si la ultima carga vino del backend o del fallback.
 */
export function isMachinesFallback() {
  return !_cache
}

/**
 * Limpia cache (forzar recarga en proximo request).
 */
export function clearMachinesCache() {
  _cache = null
  _cacheTs = 0
}
