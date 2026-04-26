// materialsService.js — Capa de acceso a /api/production/materials/*
// ═══════════════════════════════════════════════════════════════════════════════
// Backend es la fuente de verdad. Este servicio NO calcula diferencias,
// NO decide estados, NO aplica tolerancias. Solo transporta payload.
//
// Endpoints reales (desplegados 2026-04-16, verificados en vivo):
//   POST /api/production/materials/catalog
//   POST /api/production/materials/issue/list
//   POST /api/production/materials/issue/create
//   POST /api/production/materials/issue/cancel
//   POST /api/production/materials/settlement/report
//   POST /api/production/materials/settlement/validate
//   POST /api/production/materials/settlement/reject
//   POST /api/production/materials/settlement/dispute
//   POST /api/production/materials/settlement/resolve_rejected
//   POST /api/production/materials/settlement/list
//   POST /api/production/materials/reconcile
//
// Los endpoints de settlement aceptan lookup dual:
//   { settlement_id }  ó  { shift_id, line_id, material_id }
// ═══════════════════════════════════════════════════════════════════════════════

import { api } from '../../lib/api.js'
import { normalizeDispatchConfig } from './materialDispatchConfig.js'

// ── Catálogo de materiales (para selector al crear issue) ─────────────────────
export async function getMaterialCatalog({ plantId, lineType, activeOnly = true } = {}) {
  const qs = new URLSearchParams()
  if (plantId) qs.set('plant_id', String(plantId))
  if (lineType) qs.set('line_type', String(lineType))
  qs.set('active_only', activeOnly ? '1' : '0')
  const res = await api('GET', `/api/production/materials/catalog?${qs}`)
  if (res?.error) throw new Error(res.error)
  const payload = res?.data ?? res ?? {}
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    raw: payload,
  }
}

// ── Lista de issues entregados al turno ───────────────────────────────────────
export async function getMaterialIssues({ shiftId, lineId, states } = {}) {
  if (!shiftId) throw new Error('shift_id requerido')
  const qs = new URLSearchParams({ shift_id: String(shiftId) })
  if (lineId) qs.set('line_id', String(lineId))
  if (Array.isArray(states) && states.length) qs.set('states', states.join(','))
  const res = await api('GET', `/api/production/materials/issues?${qs}`)
  if (res?.error) throw new Error(res.error)
  const payload = res?.data ?? res ?? {}
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    raw: payload,
  }
}

// ── Crear issue (bodeguero entrega material al turno) ─────────────────────────
export async function createMaterialIssue({
  shiftId, lineId, materialId, qtyIssued, issuedBy, opTagIds, notes,
} = {}) {
  if (!shiftId || !lineId || !materialId) {
    throw new Error('shift_id, line_id y material_id son requeridos')
  }
  if (!(Number(qtyIssued) > 0)) throw new Error('qty_issued debe ser mayor a 0')
  const res = await api('POST', '/api/production/materials/issue/create', {
    shift_id: shiftId,
    line_id: lineId,
    material_id: materialId,
    qty_issued: Number(qtyIssued),
    issued_by: issuedBy,
    op_tag_ids: Array.isArray(opTagIds) ? opTagIds : undefined,
    notes: notes || '',
  })
  if (res?.error) throw new Error(res.error)
  return res?.data ?? res ?? {}
}

// ── Cancelar issue (solo mientras settlement esté en draft) ───────────────────
export async function cancelMaterialIssue({ issueId, employeeId, notes } = {}) {
  if (!issueId) throw new Error('issue_id requerido')
  const res = await api('POST', '/api/production/materials/issue/cancel', {
    issue_id: issueId,
    employee_id: employeeId,
    notes: notes || '',
  })
  if (res?.error) throw new Error(res.error)
  return res?.data ?? res ?? {}
}

// ── Operador reporta consumo (issue → settlement.reported) ────────────────────
// Acepta settlementId o la tripleta (shiftId, lineId, materialId).
//
// Contrato definitivo (2026-04-16): el operador SOLO confirma que usó el material.
// NO captura sobrante (qty_remaining), merma ni consumo — esos datos los registra
// el auxiliar admin. Payload: lookup + employee_id + notes.
export async function reportMaterial({
  settlementId, shiftId, lineId, materialId,
  notes, employeeId,
} = {}) {
  if (!settlementId && !(shiftId && lineId && materialId)) {
    throw new Error('Debe enviar settlement_id o (shift_id, line_id, material_id)')
  }
  const res = await api('POST', '/api/production/materials/report', {
    settlement_id: settlementId,
    shift_id: shiftId,
    line_id: lineId,
    material_id: materialId,
    employee_id: employeeId,
    notes: notes || '',
  })
  if (res?.error) throw new Error(res.error)
  return res?.data ?? res ?? {}
}

// ── Auxiliar admin valida / rechaza / disputa un settlement ───────────────────
export async function validateMaterial({
  settlementId, shiftId, lineId, materialId,
  action, notes, employeeId,
} = {}) {
  if (!['validate', 'reject', 'dispute'].includes(action)) {
    throw new Error('action debe ser validate|reject|dispute')
  }
  if (!settlementId && !(shiftId && lineId && materialId)) {
    throw new Error('Debe enviar settlement_id o (shift_id, line_id, material_id)')
  }
  const res = await api('POST', '/api/production/materials/validate', {
    settlement_id: settlementId,
    shift_id: shiftId,
    line_id: lineId,
    material_id: materialId,
    action,
    employee_id: employeeId,
    notes: notes || '',
  })
  if (res?.error) throw new Error(res.error)
  return res?.data ?? res ?? {}
}

// ── Admin resuelve settlement rechazado con desglose final ────────────────────
// Backend valida: qty_returned + qty_damaged + qty_consumed === qty_issued.
export async function resolveRejectedSettlement({
  settlementId, shiftId, lineId, materialId,
  qtyReturned, qtyDamaged, qtyConsumed, notes, employeeId,
} = {}) {
  if (!settlementId && !(shiftId && lineId && materialId)) {
    throw new Error('Debe enviar settlement_id o (shift_id, line_id, material_id)')
  }
  const res = await api('POST', '/api/production/materials/resolve-rejected', {
    settlement_id: settlementId,
    shift_id: shiftId,
    line_id: lineId,
    material_id: materialId,
    employee_id: employeeId,
    qty_returned: Number(qtyReturned || 0),
    qty_damaged: Number(qtyDamaged || 0),
    qty_consumed: Number(qtyConsumed || 0),
    notes: notes || '',
  })
  if (res?.error) throw new Error(res.error)
  return res?.data ?? res ?? {}
}

// ── Inbox de settlements pendientes (para auxiliar admin) ─────────────────────
export async function getPendingSettlements({ plantId, shiftId, states } = {}) {
  const qs = new URLSearchParams()
  if (plantId) qs.set('plant_id', String(plantId))
  if (shiftId) qs.set('shift_id', String(shiftId))
  if (Array.isArray(states) && states.length) qs.set('states', states.join(','))
  const res = await api('GET', `/api/production/materials/settlements-pending?${qs}`)
  if (res?.error) throw new Error(res.error)
  const payload = res?.data ?? res ?? {}
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    raw: payload,
  }
}

// ── Reconciliación de materiales del turno ────────────────────────────────────
export async function getMaterialsReconcile({ shiftId, plantId } = {}) {
  if (!shiftId) throw new Error('shift_id requerido')
  const qs = new URLSearchParams({ shift_id: String(shiftId) })
  if (plantId) qs.set('plant_id', String(plantId))
  const res = await api('GET', `/api/production/materials/reconcile?${qs}`)
  if (res?.error) throw new Error(res.error)
  const payload = res?.data ?? res ?? {}
  return {
    shift: payload.shift || null,
    plant: payload.plant || null,
    byLine: Array.isArray(payload.by_line) ? payload.by_line : [],
    summary: payload.summary || {},
    incidents: Array.isArray(payload.incidents) ? payload.incidents : [],
    consistent: Boolean(payload.consistent),
    raw: payload,
  }
}

/** Stock disponible filtrado para la vista Traspaso MP del gerente
 *  (3 MP Laurita en location PIGU/MP-IGUALA — fijo para Fabricación-Iguala). */
export async function getTraspasoMpIgualaStock() {
  const res = await api('GET', '/pwa-admin/traspaso-mp/iguala-stock')
  if (res?.error) throw new Error(res.error)
  const payload = res?.data ?? res ?? {}
  return {
    locationId: payload.location_id,
    locationName: payload.location_name || '',
    products: Array.isArray(payload.products) ? payload.products : [],
  }
}

/** Traspaso directo PIGU/MP-IGUALA → PROCESO-ROLITO (single-step stock.move).
 *  Sin material.issue ni dispatch_config — solo mueve stock al confirmar. */
export async function traspasoMpIgualaTransfer({ productId, qty, notes } = {}) {
  if (!productId) throw new Error('product_id requerido')
  if (!(Number(qty) > 0)) throw new Error('qty debe ser mayor a 0')
  const res = await api('POST', '/pwa-admin/traspaso-mp/iguala-transfer', {
    product_id: Number(productId),
    qty: Number(qty),
    notes: notes || '',
  })
  if (res && res.ok === false) {
    throw new Error(res.message || 'Error al crear el traspaso')
  }
  return res?.data ?? res ?? {}
}

export async function getDispatchConfig({ warehouseId } = {}) {
  if (!warehouseId) throw new Error('warehouse_id requerido')
  const qs = new URLSearchParams({ warehouse_id: String(warehouseId) })
  const res = await api('GET', `/api/production/materials/dispatch-config?${qs}`)
  return normalizeDispatchConfig(res?.data ?? res ?? {})
}

export async function createDispatchTransfer({
  warehouseId,
  destinationKey,
  workerEmployeeId,
  materialId,
  qtyIssued,
  issuedBy,
  notes,
} = {}) {
  if (!warehouseId) throw new Error('warehouse_id requerido')
  if (!destinationKey) throw new Error('destination_key requerido')
  if (!materialId) throw new Error('material_id requerido')
  if (!(Number(qtyIssued) > 0)) throw new Error('qty_issued debe ser mayor a 0')

  const res = await api('POST', '/api/production/materials/dispatch-transfer', {
    warehouse_id: Number(warehouseId),
    destination_key: String(destinationKey),
    worker_employee_id: Number(workerEmployeeId || 0) || undefined,
    material_id: Number(materialId),
    qty_issued: Number(qtyIssued),
    issued_by: Number(issuedBy || 0) || undefined,
    notes: notes || '',
  })

  return res?.data ?? res ?? {}
}

// ── Helpers de presentación (no lógica de negocio) ─────────────────────────────

export function stateLabel(state) {
  const map = {
    draft:        'Borrador',
    confirmed:    'Confirmado',
    issued:       'Entregado',
    reported:     'Reportado',
    validated:    'Validado',
    rejected:     'Rechazado',
    disputed:     'En disputa',
    force_closed: 'Cerrado forzado',
    abandoned:    'Abandonado',
    consumed:     'Consumido',
  }
  return map[state] || state || '—'
}

export function colorForSeverity(severity) {
  if (severity === 'high')   return '#ef4444'
  if (severity === 'medium') return '#f59e0b'
  if (severity === 'low')    return '#22c55e'
  return 'rgba(255,255,255,0.45)'
}

export function colorForState(state) {
  if (state === 'validated') return '#22c55e'
  if (state === 'reported')  return '#3b82f6'
  if (state === 'disputed')  return '#f59e0b'
  if (state === 'rejected')  return '#ef4444'
  if (state === 'force_closed') return '#a855f7'
  if (state === 'abandoned') return 'rgba(255,255,255,0.35)'
  return 'rgba(255,255,255,0.55)'
}

// Familia operativa (BARRA/ROLITO/OTRO) del backend.
// line_type es el campo real del endpoint; line/product_family son fallbacks.
export function lineOf(item) {
  const raw = String(
    item?.line_type || item?.line_name || item?.line || item?.product_family || ''
  ).toUpperCase()
  if (raw.includes('BARRA')) return 'BARRA'
  if (raw.includes('ROLITO')) return 'ROLITO'
  return raw || 'OTRO'
}
