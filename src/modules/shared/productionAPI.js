// productionAPI.js — Consolidacion Fase 11
// Servicio unificado de produccion. Capa unica entre los modulos del PWA
// y los endpoints de Odoo (/api/production/*).
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ PRODUCCION — Odoo controllers (via odooHttp):                      │
// │   shift/close-check ·· shift/close ·· validate-pin                │
// │   machines ·· lines ·· shift/bag-reconciliation ·· pt/reconcile   │
// │                                                                     │
// │ INCIDENTES — BFF-generado (pendiente migrar a controller):         │
// │   incidents GET/POST ·· incidents/resolve                          │
// │                                                                     │
// │ LOGISTICA — Handover NO conectado (scope separado):                │
// │   /api/production/handover → NO EXISTE                             │
// └─────────────────────────────────────────────────────────────────────┘

import { api } from '../../lib/api'

// ═══════════════════════════════════════════════════════════════════════════════
// Endpoints REALES — Odoo controllers confirmados (via odooHttp)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Consulta la evaluacion de cierre del turno directo en Odoo
 * (_get_close_readiness → /api/production/shift/close-check).
 *
 * @param {number} shiftId
 * @returns {Promise<{
 *   can_close: boolean,
 *   blockers: string[],
 *   warnings: string[],
 *   summary: {
 *     cycles_count?: number, produced_kg?: number, packed_kg?: number,
 *     scrap_kg?: number, balance_pct?: number,
 *     open_downtimes?: number, open_incidents?: number,
 *     has_checklist?: boolean, has_energy_start?: boolean, has_energy_end?: boolean,
 *     has_handover?: boolean,
 *   }
 * }>}
 */
export function getCloseReadiness(shiftId) {
  return api('POST', '/api/production/shift/close-check', { shift_id: shiftId })
}

/**
 * Cierra un turno via el controlador REST real (action_close_shift).
 *
 * @param {number} shiftId
 * @returns {Promise<{ok: boolean, error?: string, warnings?: string[]}>}
 */
export function closeShift(shiftId) {
  return api('POST', '/api/production/shift/close', { shift_id: shiftId })
}

/**
 * Valida el PIN de un supervisor contra el hash almacenado en hr.employee.
 *
 * @param {string} pin
 * @param {number} [employeeId] — si se omite, usa el employee del session
 * @returns {Promise<{ok: boolean, employee_id?: number, employee_name?: string, error?: string}>}
 */
export function validatePin(pin, employeeId) {
  return api('POST', '/api/production/validate-pin', {
    pin,
    employee_id: employeeId || undefined,
  })
}

/**
 * Obtiene lista de maquinas disponibles para la planta.
 * CONTRATO CANONICO: [{ id, name, type, plant, line }]
 *
 * @returns {Promise<Array<{id: number, name: string, type: string, plant: object, line: object}>>}
 */
export function getMachines() {
  return api('GET', '/api/production/machines')
}

/**
 * Obtiene lista de lineas de produccion de la planta.
 * CONTRATO CANONICO: [{ id, name, type, plant }]
 *
 * @returns {Promise<Array<{id: number, name: string, type: string, plant: object}>>}
 */
export function getLines() {
  return api('GET', '/api/production/lines')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bag Reconciliation — Odoo controller real
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reconciliacion de bolsas del turno.
 * CONTRATO CANONICO:
 *   Request:  { shift_id, bags_received, bags_remaining }
 *   Response: { data: { bag_reconciliation: {...} } }
 *
 * Frontend NO debe leer x_bags_received/x_bags_remaining — son internos de Odoo.
 *
 * @param {object} data — { shift_id, bags_received, bags_remaining }
 * @returns {Promise<object>}
 */
export function bagReconciliation(data) {
  return api('POST', '/api/production/shift/bag-reconciliation', data)
}

// ═══════════════════════════════════════════════════════════════════════════════
// PT Reconcile — Odoo controller real
// Backend calcula la verdad del sistema. Frontend NO recalcula.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reconciliacion de inventario con almacen PT.
 * CONTRATO CANONICO:
 *   Request:  { shift_id, plant_id?, manual: { pt_received_kg? } }
 *   Response: { manual, system, differences, incidents, consistent }
 *
 * @param {object} data
 * @returns {Promise<{manual: object, system: object, differences: object, incidents: Array, consistent: boolean}>}
 */
export function ptReconcile(data) {
  return api('POST', '/api/production/pt/reconcile', data)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Incidentes — BFF-generado (readModelSorted/createUpdate, NO Odoo controller)
// Modelo: gf.production.incident
// Campos confirmados: id, name, description, incident_type, severity, state,
//                     shift_id, reported_by_id, create_date
// Campos NO confirmados: resolution, resolved_at, resolved_by_id
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene incidentes del turno.
 * @param {number} shiftId
 * @returns {Promise<Array>}
 */
export function getIncidents(shiftId) {
  return api('GET', `/api/production/incidents?shift_id=${shiftId}`)
}

/**
 * Crea un incidente de produccion.
 * @param {object} data — { shift_id, name, description, incident_type, severity, reported_by_id }
 * @returns {Promise<{success: boolean, data?: any}>}
 */
export function createIncident(data) {
  return api('POST', '/api/production/incidents', data)
}

/**
 * Resuelve (cierra) un incidente de produccion.
 * Solo cambia `state` a 'resolved'. Campos como `resolution`, `resolved_at`,
 * `resolved_by_id` NO se envian porque no estan confirmados en el modelo Odoo.
 *
 * @param {number} incidentId
 * @returns {Promise<{success: boolean}>}
 */
export function resolveIncident(incidentId) {
  return api('POST', '/api/production/incidents/resolve', {
    incident_id: incidentId,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy endpoints (BFF /pwa-* — operativos, sin reemplazo REST)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Endpoints BFF que siguen en uso (supervision/api.js, produccion/api.js):
//   /pwa-sup/downtimes       → SIN REEMPLAZO REST
//   /pwa-sup/downtime-create → SIN REEMPLAZO REST
//   /pwa-sup/downtime-close  → SIN REEMPLAZO REST
//   /pwa-sup/scraps          → SIN REEMPLAZO REST
//   /pwa-sup/scrap-create    → SIN REEMPLAZO REST
//   /pwa-sup/energy          → SIN REEMPLAZO REST
//   /pwa-sup/energy-create   → SIN REEMPLAZO REST
//
// ELIMINADOS en Fase 5/6:
//   /pwa-sup/shift-close     → Reemplazado por closeShift() de este modulo
//   closeShift deprecated en supervision/api.js → eliminado Fase 6
