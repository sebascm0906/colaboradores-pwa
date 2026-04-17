// handoverService.js — Fase 6, hardening Fase 7/9
// Servicio centralizado de handover de turno.
// Capa entre las pantallas y handoverLocalStore.js.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ DOMINIO: LOGISTICA (NO produccion)                                  │
// │ Contrato de handover pertenece al dominio de logistica.            │
// │ Existen endpoints reales en /gf/logistics/api/.../shift_handover/  │
// │ pero su integracion es scope separado de produccion.               │
// │                                                                     │
// │ ESTADO ACTUAL: localStorage puro                                    │
// │   - Modelo gf.shift.handover → NO ESTA CONECTADO                  │
// │   - Endpoint /api/production/handover → NO EXISTE                  │
// │   - TODA persistencia es localStorage (temporal, no oficial)       │
// │                                                                     │
// │ NO INTEGRAR en esta fase.                                           │
// │ Se evaluara en una fase separada de logistica.                     │
// └─────────────────────────────────────────────────────────────────────┘
//
// Consumido por: ScreenHandoverTurno.

import {
  getHandoverLocal,
  saveHandoverLocal,
  submitHandover,
  buildHandoverPayload,
} from './handoverLocalStore'
import { loadShiftReadiness } from './shiftReadiness'
import { loadIncidents, getOpenIncidents } from './incidentService'

/**
 * Carga todos los datos necesarios para la pantalla de handover.
 *
 * @param {number} shiftId
 * @returns {Promise<{
 *   snapshot: object,
 *   incidents: Array,
 *   openIncidents: Array,
 *   savedHandover: object|null,
 * }>}
 */
export async function loadHandoverData(shiftId) {
  if (!shiftId) return { snapshot: null, incidents: [], openIncidents: [], savedHandover: null }

  const [readinessResult, incidents] = await Promise.all([
    loadShiftReadiness(shiftId),
    loadIncidents(shiftId),
  ])

  return {
    snapshot: readinessResult.snapshot,
    incidents,
    openIncidents: getOpenIncidents(incidents),
    savedHandover: getHandoverLocal(shiftId),
  }
}

/**
 * Construye el payload completo de handover integrando produccion + incidentes.
 *
 * @param {object} params
 * @param {number} params.shiftId
 * @param {object} params.form — { incidents, pending_tasks, signature_from, signature_to, notes }
 * @param {object} params.snapshot — snapshot de shiftReadiness
 * @param {Array}  params.structuredIncidents — incidentes de gf.production.incident
 * @param {boolean} params.signed
 * @returns {object}
 */
export function buildFullHandoverPayload({
  shiftId, form, snapshot, structuredIncidents = [], signed = false,
}) {
  const totals = snapshot?.totals || { producedKg: 0, mermaKg: 0, packedKg: 0 }
  const cycles = snapshot?.cycles || []
  const downtimes = snapshot?.downtimes || []

  const cyclesCount = cycles.filter(c => c.state === 'dumped').length
  const openDowntimes = downtimes.filter(d => d.state === 'open').length

  // Inventario pendiente: ciclos no terminados
  const inventorySnapshot = cycles
    .filter(c => c.state && c.state !== 'dumped')
    .map(c => ({
      ref: `Ciclo #${c.cycle_number || c.id}`,
      detail: `${c.state}${c.kg_dumped ? ` / ${c.kg_dumped} kg` : ''}`,
    }))

  return {
    incidents: form.incidents || '',
    pending_tasks: form.pending_tasks || '',
    signature_from: form.signature_from || '',
    signature_to: form.signature_to || '',
    notes: form.notes || '',
    inventory_snapshot: inventorySnapshot,
    production_summary: {
      cycles_dumped: cyclesCount,
      produced_kg: totals.producedKg,
      merma_kg: totals.mermaKg,
      packed_kg: totals.packedKg,
      downtimes_total: downtimes.length,
      downtimes_open: openDowntimes,
    },
    structured_incidents: structuredIncidents.map(i => ({
      id: i.id,
      name: i.name,
      incident_type: i.incident_type,
      severity: i.severity,
      state: i.state,
    })),
    signed,
    signed_at: signed ? new Date().toISOString() : null,
  }
}

/**
 * Guarda borrador de handover (solo local).
 */
export function saveDraft(shiftId, handoverData) {
  return saveHandoverLocal(shiftId, { ...handoverData, signed: false })
}

/**
 * Firma y envia handover.
 * HOY: siempre guarda en localStorage (backend no existe).
 * FUTURO: enviara a /api/production/handover cuando exista.
 */
export async function signAndSubmit(shiftId, handoverData) {
  return submitHandover(shiftId, { ...handoverData, signed: true, signed_at: new Date().toISOString() })
}

// Re-export para conveniencia
export { getHandoverLocal, buildHandoverPayload }
