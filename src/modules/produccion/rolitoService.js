// rolitoService.js — V2 Operador de Rolito Service Layer
// Aggregates data from existing production endpoints for V2 screens.
// All functions connected to real Odoo backend (models verified in production).

import {
  getMyShift,
  getCycles,
  getPackingEntries,
  getPackingProducts,
  createCycle,
  updateCycle,
  createPackingEntry,
  getChecklist,
  submitCheck,
  completeChecklist,
  getDowntimeCategories,
  getScrapReasons,
  createDowntime,
  createScrap,
  saveBagReconciliation as apiSaveBagReconciliation,
  closeShift as apiCloseShift,
} from './api'
import { computePackingCoherence } from '../shared/packingCoherence'
import { getMaterialIssues } from '../almacen-pt/materialsService'
import {
  DEFAULT_EXPECTED_DEFROST_MIN,
  DEFAULT_EXPECTED_FREEZE_MIN,
} from './cycleTiming'

// ── Constants ────────────────────────────────────────────────────────────────

export const MACHINE_ID_EVAPORADOR = 2
export const EXPECTED_FREEZE_MIN = DEFAULT_EXPECTED_FREEZE_MIN
export const EXPECTED_DEFROST_MIN = DEFAULT_EXPECTED_DEFROST_MIN
export const EXPECTED_CYCLE_MIN = 30
export const EXPECTED_KG_PER_CYCLE = 650

export const CYCLE_STATES = {
  freezing:   { label: 'Congelando',   color: '#2B8FE0' },
  defrosting: { label: 'Deshielo',     color: '#f59e0b' },
  dumped:     { label: 'Completado',   color: '#22c55e' },
  cancelled:  { label: 'Cancelado',    color: '#ef4444' },
}

export const FALLBACK_PRODUCTS = []

export function computeAvailableBagMaterials(issues, packingEntries) {
  const validIssues = (issues || []).filter(it => {
    const state = String(it?.settlement_state || it?.state || '').toLowerCase()
    return ['validated', 'reported', 'disputed', 'draft', 'issued'].includes(state)
  })
  let packedBagsLeft = (packingEntries || []).reduce((sum, entry) => sum + (Number(entry.qty_bags) || 0), 0)

  return validIssues.map(it => {
    const issued = Number(it.qty_issued || 0)
    const consumed = Math.min(issued, packedBagsLeft)
    const remaining = Math.max(0, issued - consumed)
    packedBagsLeft = Math.max(0, packedBagsLeft - issued)
    return {
      id: it.id || it.issue_id || it.material_id,
      name: it.product_name || it.material_name || 'Material',
      issued,
      consumed,
      remaining,
      state: it.settlement_state || it.state || '',
      materialId: it.material_id || null,
    }
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0')

export function nowDatetime() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function fmtTime(dt) {
  if (!dt) return '--:--'
  try {
    const d = new Date(dt.replace(' ', 'T'))
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '--:--' }
}

export function minutesBetween(start, end) {
  if (!start || !end) return 0
  try {
    const a = new Date(start.replace(' ', 'T'))
    const b = new Date(end.replace(' ', 'T'))
    return Math.round((b - a) / 60000)
  } catch { return 0 }
}

// ── LIVE: Shift Overview ─────────────────────────────────────────────────────

/**
 * Builds a complete shift overview for the rolito hub.
 * Fetches shift, cycles, packing, and checklist in parallel.
 * Returns a single aggregated object with everything the hub needs.
 */
export async function getShiftOverview() {
  const shift = await getMyShift()
  if (!shift?.id) return { shift: null, cycles: [], packing: [], checklist: null, kpis: null, bagMaterials: [] }

  const [cyclesRes, packingRes, checklistRes, materialsRes] = await Promise.allSettled([
    getCycles(shift.id),
    getPackingEntries(shift.id),
    getChecklist(shift.id).catch(() => null),
    getMaterialIssues({ shiftId: shift.id, lineId: 2 }).catch(() => ({ items: [] })),
  ])

  const cycles = cyclesRes.status === 'fulfilled' ? (cyclesRes.value || []) : []
  const packing = packingRes.status === 'fulfilled' ? (packingRes.value || []) : []
  const checklist = checklistRes.status === 'fulfilled' ? checklistRes.value : null
  const materialIssues = materialsRes.status === 'fulfilled' ? (materialsRes.value?.items || []) : []
  const bagMaterials = computeAvailableBagMaterials(materialIssues, packing)

  const kpis = computeKPIs(shift, cycles, packing)

  return { shift, cycles, packing, checklist, kpis, bagMaterials }
}

// ── LIVE: Cycle Analysis ─────────────────────────────────────────────────────

/**
 * Returns the active cycle (freezing or defrosting) or null.
 */
export function getActiveCycle(cycles) {
  if (!cycles?.length) return null
  return cycles.find(c => c.state === 'freezing' || c.state === 'defrosting') || null
}

/**
 * Returns the last completed (dumped) cycle or null.
 */
export function getLastDumpedCycle(cycles) {
  if (!cycles?.length) return null
  const dumped = cycles.filter(c => c.state === 'dumped')
  if (!dumped.length) return null
  return dumped.reduce((latest, c) => {
    if (!latest) return c
    const a = c.defrost_end || c.freeze_end || c.freeze_start || ''
    const b = latest.defrost_end || latest.freeze_end || latest.freeze_start || ''
    return a > b ? c : latest
  }, null)
}

/**
 * Computes cycle progress and countdown for an active cycle.
 * Returns { phase, progressPct, remainingMin, remainingSec, elapsed, isOverdue }
 */
export function getCycleProgress(cycle) {
  if (!cycle) return null

  const now = new Date()

  if (cycle.state === 'freezing' && cycle.freeze_start) {
    const start = new Date(cycle.freeze_start.replace(' ', 'T'))
    const elapsedMs = now - start
    const elapsedMin = elapsedMs / 60000
    const expectedMin = cycle.expected_freeze_min || EXPECTED_FREEZE_MIN
    const progressPct = Math.min(100, Math.round((elapsedMin / expectedMin) * 100))
    const remainingMs = Math.max(0, (expectedMin * 60000) - elapsedMs)
    const remainingMin = Math.floor(remainingMs / 60000)
    const remainingSec = Math.floor((remainingMs % 60000) / 1000)

    return {
      phase: 'freezing',
      phaseLabel: 'Congelando',
      progressPct,
      remainingMin,
      remainingSec,
      elapsedMin: Math.round(elapsedMin),
      isOverdue: elapsedMin > expectedMin,
      expectedMin,
    }
  }

  if (cycle.state === 'defrosting' && cycle.defrost_start) {
    const start = new Date(cycle.defrost_start.replace(' ', 'T'))
    const elapsedMs = now - start
    const elapsedMin = elapsedMs / 60000
    const expectedMin = cycle.expected_defrost_min || EXPECTED_DEFROST_MIN
    const progressPct = Math.min(100, Math.round((elapsedMin / expectedMin) * 100))
    const remainingMs = Math.max(0, (expectedMin * 60000) - elapsedMs)
    const remainingMin = Math.floor(remainingMs / 60000)
    const remainingSec = Math.floor((remainingMs % 60000) / 1000)

    return {
      phase: 'defrosting',
      phaseLabel: 'Deshielo',
      progressPct,
      remainingMin,
      remainingSec,
      elapsedMin: Math.round(elapsedMin),
      isOverdue: elapsedMin > expectedMin,
      expectedMin,
    }
  }

  return null
}

/**
 * Determines the "what's next" action for the operator.
 * Returns { action, label, description, route, urgency }
 */
export function getNextAction(shift, cycles, checklist, packing = [], bagMaterials = []) {
  if (!shift) return { action: 'no_shift', label: 'Sin turno', description: 'No hay turno activo', route: null, urgency: 'blocked' }

  // 1. Checklist not done → push to checklist
  if (checklist && checklist.state !== 'completed' && checklist.state !== 'done') {
    return { action: 'checklist', label: 'Hacer checklist', description: 'Completa la inspeccion antes de empezar', route: '/produccion/checklist', urgency: 'required' }
  }

  const active = getActiveCycle(cycles)
  const totalBagsAvailable = bagMaterials.reduce((sum, item) => sum + (Number(item.remaining) || 0), 0)

  // 2. Active cycle freezing → wait
  if (active?.state === 'freezing') {
    const progress = getCycleProgress(active)
    if (progress?.isOverdue) {
      return { action: 'end_freeze', label: 'Terminar congelacion', description: 'Tiempo cumplido, marca fin de congelacion', route: '/produccion/ciclo', urgency: 'urgent' }
    }
    return { action: 'wait_freeze', label: 'Congelando...', description: `Faltan ${progress?.remainingMin || '?'} min`, route: null, urgency: 'wait' }
  }

  // 3. Active cycle defrosting → wait for dump
  if (active?.state === 'defrosting') {
    const progress = getCycleProgress(active)
    if (progress?.isOverdue) {
      return { action: 'end_defrost', label: 'Registrar descarga', description: 'Deshielo completo, registra los kg', route: '/produccion/ciclo', urgency: 'urgent' }
    }
    return { action: 'wait_defrost', label: 'Deshielo...', description: `Faltan ${progress?.remainingMin || '?'} min`, route: null, urgency: 'wait' }
  }

  // 4. Last cycle dumped but no packing yet → push to packing
  const lastDumped = getLastDumpedCycle(cycles)
  if (lastDumped) {
    const coherence = computePackingCoherence(cycles, packing)
    const pendingCycle = coherence.perCycle.find(c => c.status === 'unpacked' || c.status === 'partial')
    if (pendingCycle) {
      const cycleLabel = pendingCycle.cycleNumber || lastDumped.cycle_number
      const remainingKg = Math.max(0, Math.round(pendingCycle.diff || 0))
      return { action: 'packing', label: 'Registrar empaque', description: `Ciclo ${cycleLabel}: ${remainingKg} kg pendientes`, route: '/produccion/empaque', urgency: 'required' }
    }
  }

  // 5. No active cycle → start one
  if (totalBagsAvailable <= 0) {
    return {
      action: 'need_materials',
      label: 'Espera bolsa',
      description: 'No hay bolsa disponible en el turno para iniciar produccion',
      route: '/almacen-pt/materiales',
      urgency: 'required',
    }
  }
  return { action: 'start_cycle', label: 'Iniciar ciclo', description: 'No hay ciclo en curso, empieza uno nuevo', route: '/produccion/ciclo', urgency: 'action' }
}

/**
 * Gets alert info from cycle diagnostic fields.
 * Uses alert_level, data_suspect, diagnostic_suggestion.
 */
export function getCycleDiagnostics(cycle) {
  if (!cycle) return null
  const alerts = []

  if (cycle.alert_level === 'critical') {
    alerts.push({ level: 'critical', message: cycle.diagnostic_suggestion || 'Alerta critica en el ciclo' })
  } else if (cycle.alert_level === 'warning') {
    alerts.push({ level: 'warning', message: cycle.diagnostic_suggestion || 'Rendimiento por debajo de lo esperado' })
  }

  if (cycle.data_suspect) {
    alerts.push({ level: 'warning', message: cycle.data_suspect_reason || 'Datos sospechosos en este ciclo' })
  }

  if (cycle.kg_dumped > 0 && cycle.kg_expected > 0) {
    const pct = ((cycle.kg_dumped / cycle.kg_expected) * 100).toFixed(0)
    if (pct < 70) {
      alerts.push({ level: 'warning', message: `Produccion al ${pct}% del esperado (${cycle.kg_dumped}/${cycle.kg_expected} kg)` })
    }
  }

  return alerts.length > 0 ? alerts : null
}

// ── LIVE: KPI Computation ────────────────────────────────────────────────────

function computeKPIs(shift, cycles, packing) {
  // Backend-first estricto: las metricas oficiales del turno vienen de
  // gf.production.shift (total_kg_produced, total_kg_packed, total_scrap_kg,
  // yield_pct). Si el backend no las ha agregado todavia, se EXPONEN como
  // null con flag `backendMissing` para que la UI pinte "—" explicito y
  // marque la metrica como no-oficial. El frontend NO sustituye silenciosamente.
  const completedCycles = cycles.filter(c => c.state === 'dumped')

  const hasBackendProduced = shift?.total_kg_produced !== undefined && shift?.total_kg_produced !== null
  const hasBackendPacked = shift?.total_kg_packed !== undefined && shift?.total_kg_packed !== null
  const hasBackendScrap = shift?.total_scrap_kg !== undefined && shift?.total_scrap_kg !== null
  const hasBackendYield = shift?.yield_pct !== undefined && shift?.yield_pct !== null

  const totalKgProduced = hasBackendProduced ? Number(shift.total_kg_produced) : null
  const totalKgPacked = hasBackendPacked ? Number(shift.total_kg_packed) : null
  const mermaKg = hasBackendScrap ? Number(shift.total_scrap_kg) : null
  const yieldPct = hasBackendYield ? Number(shift.yield_pct) : null

  // mermaPct derivada de backend (no recalculada en frontend).
  // Si falta merma o produccion, se marca null.
  let mermaPct = null
  if (mermaKg !== null && totalKgProduced !== null && totalKgProduced > 0) {
    mermaPct = parseFloat(((mermaKg / totalKgProduced) * 100).toFixed(1))
  }

  // mermaExceeded: derivado de yield_pct (autoridad backend).
  const mermaExceeded = yieldPct !== null && yieldPct > 0 && yieldPct < 99

  // Expected cycles: solo si backend lo sabe. Nunca inferimos.
  const expectedCycles = Number(shift?.x_cycles_expected) || null

  // Estimado visual separado (prefijado como NO oficial):
  // util cuando los totales backend aun no se agregan — NO sustituye metricas.
  const estimated = {
    producedKg: completedCycles.reduce((s, c) => s + (c.kg_dumped || 0), 0),
    packedKg: packing.reduce((s, p) => s + (p.total_kg || 0), 0),
    totalBags: packing.reduce((s, p) => s + (p.qty_bags || 0), 0),
  }

  return {
    completedCycles: completedCycles.length,
    activeCycles: cycles.filter(c => c.state === 'freezing' || c.state === 'defrosting').length,
    expectedCycles,
    // Oficiales (solo backend):
    totalKgProduced: totalKgProduced !== null ? Math.round(totalKgProduced) : null,
    totalKgPacked: totalKgPacked !== null ? Math.round(totalKgPacked) : null,
    mermaKg: mermaKg !== null ? Math.round(mermaKg) : null,
    mermaPct,
    mermaExceeded,
    yieldPct,
    // Flags de procedencia:
    backendMissing: !hasBackendProduced || !hasBackendPacked || !hasBackendScrap || !hasBackendYield,
    // Estimado visual (NO oficial, prefijo ~ en UI):
    estimated,
    totalBags: estimated.totalBags,
  }
}

// ── LIVE: Cycle Actions (wrappers with proper data) ──────────────────────────

/**
 * Starts a new freeze cycle. Returns the created cycle.
 */
export async function startFreeze(shiftId) {
  return createCycle({
    shift_id: shiftId,
    machine_id: MACHINE_ID_EVAPORADOR,
    freeze_start: nowDatetime(),
  })
}

/**
 * Marks end of freezing and start of defrost on active cycle.
 */
export async function markDefrost(cycleId) {
  const ts = nowDatetime()
  return updateCycle(cycleId, {
    freeze_end: ts,
    defrost_start: ts,
  })
}

/**
 * Marks end of defrost + dump with kg produced.
 * Transitions cycle to 'dumped'.
 * @param {number} cycleId
 * @param {number} kgDumped
 * @param {object} [extra] — campos adicionales (supervisor_override, override_reason, etc.)
 */
export async function markDump(cycleId, kgDumped, extra) {
  const payload = {
    defrost_end: nowDatetime(),
    kg_dumped: parseFloat(kgDumped),
  }
  if (extra && typeof extra === 'object') {
    Object.assign(payload, extra)
  }
  return updateCycle(cycleId, payload)
}

/**
 * Register packing entry.
 * cycle_id is sent if available — backend may or may not link it.
 */
export async function registerPacking(shiftId, productId, qtyBags, cycleId) {
  const data = {
    shift_id: shiftId,
    product_id: productId,
    qty_bags: parseInt(qtyBags),
    timestamp: nowDatetime(),
  }
  if (cycleId) {
    data.cycle_id = cycleId
  }
  return createPackingEntry(data)
}

// ── LIVE: Products ───────────────────────────────────────────────────────────

export async function getProducts(options = {}) {
  try {
    const prods = await getPackingProducts(options)
    return Array.isArray(prods) ? prods : FALLBACK_PRODUCTS
  } catch {
    return FALLBACK_PRODUCTS
  }
}

// ── LIVE: Incidencias (Downtime + Scrap) ────────────────────────────────────
// Models confirmed in Odoo production:
//   gf.production.downtime  → shift_id, category_id, operator_id, reason, start_time, end_time, minutes
//   gf.production.downtime.category → 4 records (Falta de agua, Corte de energia, Falla de maquina, Paro por calidad)
//   gf.production.scrap     → shift_id, reason_id, operator_id, kg, notes
//   gf.production.scrap.reason → 3 records (Derretido, Roto, Sellado deficiente)

/**
 * Fetch downtime categories from Odoo.
 * Returns [{id, name}, ...] — e.g. [{id:1, name:'Falta de agua'}, ...]
 */
export { getDowntimeCategories }

/**
 * Fetch scrap reasons from Odoo.
 * Returns [{id, name}, ...] — e.g. [{id:1, name:'Derretido'}, ...]
 */
export { getScrapReasons }

/**
 * Register a downtime event on the current shift.
 * @param {number} shiftId
 * @param {number} categoryId — from gf.production.downtime.category
 * @param {string} reason — free text description
 * @param {number} [minutes] — duration in minutes (0 if open-ended)
 */
export async function registerDowntime(shiftId, categoryId, reason, minutes = 0, lineId = 0) {
  const now = nowDatetime()
  return createDowntime({
    shift_id: shiftId,
    category_id: categoryId,
    line_id: lineId || undefined,
    reason: reason || '',
    start_time: now,
    end_time: minutes > 0 ? now : false,
    minutes: minutes || 0,
  })
}

/**
 * Register a scrap event on the current shift.
 * @param {number} shiftId
 * @param {number} reasonId — from gf.production.scrap.reason
 * @param {number} kg — kilograms lost
 * @param {string} [notes] — optional description
 */
export async function registerScrap(shiftId, reasonId, kg, notes = '', lineId = 0) {
  return createScrap({
    shift_id: shiftId,
    reason_id: reasonId,
    line_id: lineId || undefined,
    kg: parseFloat(kg) || 0,
    notes: notes || '',
  })
}

// ── LIVE: Cierre de Turno ───────────────────────────────────────────────────
// Bag reconciliation usa contrato canonico:
//   POST /api/production/shift/bag-reconciliation
//   Request:  { shift_id, bags_received, bags_remaining }
//   Response: { data: { bag_reconciliation: {...} } }
//   Campos internos x_bags_* son responsabilidad de Odoo, no del frontend.

/**
 * Save bag reconciliation on the shift.
 */
export async function saveBagReconciliation(shiftId, bagsReceived, bagsRemaining) {
  return apiSaveBagReconciliation({
    shift_id: shiftId,
    bags_received: parseInt(bagsReceived) || 0,
    bags_remaining: parseInt(bagsRemaining) || 0,
  })
}

/**
 * Close the shift (action_close or fallback to state=done).
 */
export async function closeShift(shiftId) {
  return apiCloseShift({ shift_id: shiftId })
}
