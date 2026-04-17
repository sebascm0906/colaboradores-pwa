// shiftReadiness.js — Fase 5
// Servicio de readiness de cierre de turno.
//
// Fuente unica de verdad: Odoo via /api/production/shift/close-check
// (_get_close_readiness). NO hay logica de negocio en frontend.
//
// El frontend solo:
//   1. Llama al endpoint
//   2. Muestra blockers/warnings/summary tal cual vienen
//   3. Carga snapshot local para UI informativa (totales, coherencia)
//
// Usado por: ScreenControlTurno, ScreenCierreRolito, ScreenHandoverTurno.

import { getCloseReadiness } from './productionAPI'
import { getCycles, getPackingEntries, getChecklist } from '../produccion/api'
import { getDowntimes, getEnergyReadings, getScraps } from '../supervision/api'
import { getHandoverLocal } from './handoverLocalStore'

/**
 * Carga el estado de readiness de un turno.
 *
 * Readiness viene 100% del backend (Odoo _get_close_readiness).
 * El snapshot local se carga en paralelo solo para datos de UI
 * (totales produccion, coherencia empaque, listas).
 *
 * @param {number} shiftId
 * @returns {Promise<{
 *   readiness: { canClose: boolean, blockers: string[], warnings: string[] },
 *   summary: object,
 *   snapshot: object,
 * }>}
 */
export async function loadShiftReadiness(shiftId) {
  if (!shiftId) {
    return {
      readiness: { canClose: false, blockers: ['Sin turno activo'], warnings: [] },
      summary: {},
      snapshot: null,
    }
  }

  // Cargar readiness del backend y snapshot local en paralelo
  const [backendRaw, snapshot] = await Promise.all([
    getCloseReadiness(shiftId),
    loadSnapshot(shiftId),
  ])

  // Contrato REAL verificado via live endpoint 2026-04-14:
  //   JSON-RPC envelope: { jsonrpc, id, result: { ok, message, data } }
  //   data (shift in_progress): {
  //     ready: boolean, shift_id, blockers: [{code,message,value?}],
  //     warnings: [...], summary: {...}
  //   }
  //   data (shift no in_progress): { shift_id, state }
  // Cubre blockers: energy_end, open_downtime, open_cycles, balance.
  const backendResult = backendRaw?.result || backendRaw || {}
  const data = backendResult?.data || {}
  const rawBlockers = Array.isArray(data.blockers) ? data.blockers : []
  const rawWarnings = Array.isArray(data.warnings) ? data.warnings : []

  // Caso shift no in_progress: backend responde ok:false, message explicativo, data SIN blockers.
  // Solo exponemos el message como blocker cuando el backend NO ejecuto readiness
  // (i.e., no devolvio array blockers). Cuando SI ejecuto readiness, su message
  // es "Readiness check" y no debe confundir al operador.
  const backendShortCircuited = backendResult?.ok === false
    && !Array.isArray(data.blockers)
    && !!backendResult?.message
  const notInProgressMsg = backendShortCircuited
    ? [{ code: 'shift_state', message: backendResult.message }]
    : []

  const readiness = {
    canClose: Boolean(data.ready),
    blockers: [...notInProgressMsg, ...rawBlockers].map(b =>
      typeof b === 'string' ? { code: 'generic', message: b } : b
    ),
    warnings: rawWarnings.map(w =>
      typeof w === 'string' ? { code: 'generic', message: w } : w
    ),
  }

  return {
    readiness,
    summary: data.summary || {},
    snapshot,
  }
}

// ─── Snapshot local (datos para UI, NO para readiness) ───────────────────────

async function loadSnapshot(shiftId) {
  const [cycles, downtimes, energy, scraps, packing, checklist] = await Promise.all([
    getCycles(shiftId).catch(() => []),
    getDowntimes(shiftId).catch(() => []),
    getEnergyReadings(shiftId).catch(() => []),
    getScraps(shiftId).catch(() => []),
    getPackingEntries(shiftId).catch(() => []),
    getChecklist(shiftId).catch(() => null),
  ])

  const energyStart = (energy || []).find(r => r.reading_type === 'start') || null
  const energyEnd = (energy || []).find(r => r.reading_type === 'end') || null

  const producedKg = (cycles || [])
    .filter(c => c.state === 'dumped')
    .reduce((s, c) => s + (Number(c.kg_dumped) || 0), 0)
  const mermaKg = (scraps || []).reduce((s, sc) => s + (Number(sc.kg) || 0), 0)
  const packedKg = (packing || []).reduce((s, p) => s + (Number(p.total_kg) || 0), 0)

  return {
    cycles: cycles || [],
    downtimes: downtimes || [],
    energyStart,
    energyEnd,
    checklist,
    scraps: scraps || [],
    packing: packing || [],
    totals: { producedKg, mermaKg, packedKg },
    handoverLocal: getHandoverLocal(shiftId),
  }
}
