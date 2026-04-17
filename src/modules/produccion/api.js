// ─── API Producción — Llamadas a n8n webhooks ──────────────────────────────
import { api } from '../../lib/api'

// ── Turno ────────────────────────────────────────────────────────────────────

/** Obtener turno activo del empleado autenticado */
export function getMyShift() {
  return api('GET', '/pwa-prod/my-shift')
}

/** Obtener resumen del turno (corte) */
export function getShiftSummary(shiftId) {
  return api('GET', `/pwa-prod/shift-summary?shift_id=${shiftId}`)
}

// ── Checklist HACCP ──────────────────────────────────────────────────────────

/** Obtener checklist del turno (con puntos de inspección) */
export function getChecklist(shiftId) {
  return api('GET', `/pwa-prod/checklist?shift_id=${shiftId}`)
}

/** Enviar respuesta de un punto del checklist */
export function submitCheck(checkId, data) {
  return api('POST', '/pwa-prod/checklist-check', { check_id: checkId, ...data })
}

/** Marcar checklist como completado */
export function completeChecklist(checklistId) {
  return api('POST', '/pwa-prod/checklist-complete', { checklist_id: checklistId })
}

// ── Ciclos de congelación ────────────────────────────────────────────────────

/** Obtener ciclos del turno actual */
export function getCycles(shiftId) {
  return api('GET', `/pwa-prod/cycles?shift_id=${shiftId}`)
}

/** Crear nuevo ciclo (iniciar congelación) */
export function createCycle(data) {
  return api('POST', '/pwa-prod/cycle-create', data)
}

/** Actualizar ciclo (fin congelación, inicio/fin deshielo, kg) */
export function updateCycle(cycleId, data) {
  return api('POST', '/pwa-prod/cycle-update', { cycle_id: cycleId, ...data })
}

// ── Empaque ──────────────────────────────────────────────────────────────────

/** Obtener productos de empaque disponibles (bolsas rolito) */
export function getPackingProducts() {
  return api('GET', '/pwa-prod/packing-products')
}

/** Registrar entrada de empaque */
export function createPackingEntry(data) {
  return api('POST', '/pwa-prod/packing-create', data)
}

/** Obtener entradas de empaque del turno */
export function getPackingEntries(shiftId) {
  return api('GET', `/pwa-prod/packing-entries?shift_id=${shiftId}`)
}

// ── Transformación (Barras) ──────────────────────────────────────────────────

/** Obtener productos disponibles para transformación (barras) */
export function getTransformationProducts() {
  return api('GET', '/pwa-prod/transformation-products')
}

/** Crear orden de transformación */
export function createTransformation(data) {
  return api('POST', '/pwa-prod/transformation-create', data)
}

/** Obtener transformaciones del turno */
export function getTransformations(shiftId) {
  return api('GET', `/pwa-prod/transformations?shift_id=${shiftId}`)
}

// ── Incidencias (Downtime + Scrap) ──────────────────────────────────────────

/** Obtener categorías de paro (gf.production.downtime.category) */
export function getDowntimeCategories() {
  return api('GET', '/pwa-prod/downtime-categories')
}

/** Obtener razones de merma (gf.production.scrap.reason) */
export function getScrapReasons() {
  return api('GET', '/pwa-prod/scrap-reasons')
}

/** Registrar paro (gf.production.downtime) */
export function createDowntime(data) {
  return api('POST', '/pwa-prod/downtime-create', data)
}

/** Registrar merma (gf.production.scrap) */
export function createScrap(data) {
  return api('POST', '/pwa-prod/scrap-create', data)
}

// ── Opening State (continuidad entre turnos) ────────────────────────────────

/** Obtener snapshot de apertura del turno: qué PT, materiales y estado
 *  operativo recibe el turno entrante del turno saliente.
 *  Backend crea el snapshot si no existe, o devuelve el existente.
 *  Frontend solo consume y presenta — no recalcula nada. */
export function getOpeningState(shiftId) {
  return api('POST', '/api/production/shift/opening-state', { shift_id: shiftId })
}

// ── Cierre de turno ─────────────────────────────────────────────────────────

/** Guardar cuadratura de bolsas en turno (endpoint canonico) */
export function saveBagReconciliation(data) {
  return api('POST', '/api/production/shift/bag-reconciliation', data)
}

/** Cerrar turno (action_close o fallback a state=done) */
export function closeShift(data) {
  return api('POST', '/pwa-prod/shift-close', data)
}

// ── Barra: Tanques + Slots + Harvest + Incidentes + Salt ────────────────────

/** Listar tanques de salmuera (gf.production.machine, machine_type='tanque_salmuera') */
export function getTanks() {
  return api('GET', '/pwa-prod/tanks')
}

/** Listar slots de un tanque (mapa de canastillas + tank meta) */
export function getTankSlots(machineId) {
  return api('GET', `/pwa-prod/slots?machine_id=${machineId}`)
}

/** Cosecha de slot de salmuera — POST /api/ice/slot/harvest */
export function harvestSlot(data) {
  return api('POST', '/pwa-prod/harvest', data)
}

/** Incidente de tanque — POST /api/ice/tank/incident */
export function createTankIncident(data) {
  return api('POST', '/pwa-prod/tank-incident', data)
}

/** Leer nivel de sal de máquina */
export function getMachineSalt(machineId) {
  return api('GET', `/pwa-prod/machine-salt?machine_id=${machineId}`)
}
