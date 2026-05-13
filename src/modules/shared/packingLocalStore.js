// packingLocalStore.js
// Cache local de packing entries por turno.
// Fuente de verdad: Odoo. Este store actua como fallback y respaldo
// para que el conteo no se pierda si Odoo devuelve vacio temporalmente.
//
// Estructura: { [shiftId]: { entries: [...], savedAt: ISO string } }
// Se mantienen los ultimos MAX_SHIFTS turnos; los mas viejos se purgan.

const STORAGE_KEY = 'gfsc.packing_local.v2'
const MAX_SHIFTS = 5

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

function writeStore(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* cuota llena - falla silenciosa */ }
}

function pruneOldShifts(store) {
  const keys = Object.keys(store)
  if (keys.length <= MAX_SHIFTS) return store
  keys.sort((a, b) => ((store[a]?.savedAt || '') < (store[b]?.savedAt || '') ? -1 : 1))
  keys.slice(0, keys.length - MAX_SHIFTS).forEach(k => delete store[k])
  return store
}

/**
 * Lee las entradas locales de empaque para un turno.
 * @param {number} shiftId
 * @returns {Array}
 */
export function getLocalPackingEntries(shiftId) {
  if (!shiftId) return []
  return readStore()[String(shiftId)]?.entries || []
}

/**
 * Sobreescribe el cache local con los datos que vinieron de Odoo.
 * Llamar despues de un fetch exitoso con resultados.
 * @param {number} shiftId
 * @param {Array} entries
 */
export function saveLocalPackingEntries(shiftId, entries) {
  if (!shiftId || !Array.isArray(entries)) return
  const store = pruneOldShifts(readStore())
  store[String(shiftId)] = { entries, savedAt: new Date().toISOString() }
  writeStore(store)
}

/**
 * Agrega o actualiza una entrada individual al cache.
 * Llamar inmediatamente despues de un packing-create exitoso.
 * @param {number} shiftId
 * @param {object} entry  — objeto con al menos { id, ... }
 */
export function addLocalPackingEntry(shiftId, entry) {
  if (!shiftId || !entry?.id) return
  const existing = getLocalPackingEntries(shiftId).filter(e => e.id !== entry.id)
  saveLocalPackingEntries(shiftId, [...existing, entry])
}

/**
 * Total de kg empacados segun el cache local.
 * @param {number} shiftId
 * @returns {number}
 */
export function getLocalPackingTotalKg(shiftId) {
  return getLocalPackingEntries(shiftId).reduce((sum, e) => sum + (Number(e.total_kg) || 0), 0)
}

/**
 * Timestamp de la ultima sincronizacion con Odoo.
 * @param {number} shiftId
 * @returns {string|null}
 */
export function getLocalPackingSavedAt(shiftId) {
  if (!shiftId) return null
  return readStore()[String(shiftId)]?.savedAt || null
}
