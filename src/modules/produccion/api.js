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
