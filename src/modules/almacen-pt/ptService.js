// ptService.js — V2 Almacenista Producto Terminado Service Layer
// ═══════════════════════════════════════════════════════════════════════════════
// Backend wired (Sebastián commits 2026-04-10):
//   fa20403 dashboard summary   → /api/pt/dashboard/summary
//   16341c5 transfer PT→CEDIS   → /gf/salesops/pt/transfer/orchestrate
//   a3f58c0 shift handover      → /gf/logistics/api/employee/shift_handover/*
//   56c064e scrap reasons       → gf.production.scrap.reason (PT tags)
// Backend wired (Sebastián rollout 2026-04-10 — PT followups D1/D4/D6/D10):
//   reception split buckets    → /api/pt/reception/pending (pending_posting + pending_receipt)
//   reception confirm          → /api/pt/reception/create  (gf.packing.entry, no dup stock.move)
//   transformation pending     → /api/pt/transformation/pending (gf.transformation.order)
//   transformation create      → /api/pt/transformation/create
//   forecast pending           → /api/pt/forecast/pending (warehouse→analytic, employee>branch)
//
// Architectural decisions honored by Sebastián:
//   - NO gf.pt.reception model — reception stays on gf.packing.entry
//   - NO duplicate stock.move on reception — posting via gf.inventory.posting
//   - Transformations reuse existing gf.transformation.order
//   - Forecast uses gf.saleops.forecast with employee scope precedence
//
// Base: stock.quant for real inventory. gf.pallet DESCARTADO (0 registros).
// ═══════════════════════════════════════════════════════════════════════════════

import { api } from '../../lib/api'

// ── Constants ────────────────────────────────────────────────────────────────

/** Default warehouse: Planta Iguala */
export const DEFAULT_WAREHOUSE_ID = 76

/** PT locations in Planta Iguala */
export const PT_LOCATIONS = {
  ROLITO: { id: 1164, name: 'PT-IGUALA-ROLITO', path: 'PIGU/PT-IGUALA-ROLITO' },
  BARRA:  { id: 1519, name: 'PT-IGUALA-BARRA',  path: 'PIGU/PT-IGUALA-BARRA' },
}

/** Products with known weights (verified in production) */
export const KNOWN_PRODUCTS = [
  { id: 758, name: 'LAURITA ROLITO 15KG', weight: 15, line: 'ROLITO' },
  { id: 761, name: 'LAURITA ROLITO 5.5KG', weight: 5.5, line: 'ROLITO' },
  { id: 760, name: 'LAURITA ROLITO 3.8KG', weight: 3.8, line: 'ROLITO' },
  { id: 724, name: 'BARRA GRANDE 75KG', weight: 75, line: 'BARRA' },
  { id: 725, name: 'BARRA CHICA 50KG', weight: 50, line: 'BARRA' },
  { id: 726, name: '1/4 BARRA GRANDE 12KG', weight: 15, line: 'BARRA' },
  { id: 727, name: '1/2 BARRA GRANDE 30KG', weight: 35, line: 'BARRA' },
  { id: 728, name: '1/2 BARRA CHICA 20KG', weight: 25, line: 'BARRA' },
  { id: 729, name: 'MOLIDO 25KG', weight: 25, line: 'BARRA' },
  { id: 730, name: 'MOLIDO 35KG', weight: 35, line: 'BARRA' },
]

/** FIFO thresholds (days) */
export const FIFO_THRESHOLDS = { ok: 3, warn: 7 }

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Inventory (stock.quant)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current inventory for a warehouse from stock.quant.
 * Returns items with location grouping info.
 */
export async function getInventory(warehouseId = DEFAULT_WAREHOUSE_ID) {
  const items = await api('GET', `/pwa-pt/inventory?warehouse_id=${warehouseId}`)
  return (items || []).map(item => {
    const locName = item.location_id?.[1] || item.location || ''
    const locId = item.location_id?.[0] || item.location_id || 0
    const weight = getProductWeight(item.product_id || item.id)
    return {
      ...item,
      location_name: locName,
      location_id_num: locId,
      line: locName.includes('BARRA') ? 'BARRA' : locName.includes('ROLITO') ? 'ROLITO' : 'OTRO',
      weight_per_unit: weight,
      total_kg: (item.quantity || 0) * weight,
    }
  })
}

/**
 * Get inventory grouped by location (line).
 */
export async function getInventoryGrouped(warehouseId = DEFAULT_WAREHOUSE_ID) {
  const items = await getInventory(warehouseId)
  const groups = {}
  for (const item of items) {
    const key = item.line || 'OTRO'
    if (!groups[key]) groups[key] = { line: key, location: item.location_name, items: [], total_qty: 0, total_kg: 0 }
    groups[key].items.push(item)
    groups[key].total_qty += item.quantity || 0
    groups[key].total_kg += item.total_kg || 0
  }
  return Object.values(groups)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — CEDIS list
// ═══════════════════════════════════════════════════════════════════════════════

/** Get list of CEDIS warehouses */
export async function getCedisList() {
  return api('GET', '/pwa-pt/cedis-list')
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Day Summary (backend + fallback from stock.quant)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a composite day-summary for the hub.
 * Primary source: /api/pt/dashboard/summary (Sebastián commit fa20403).
 * Fallback: assembles from stock.quant + cedis list if the endpoint fails.
 */
export async function getDaySummary(warehouseId = DEFAULT_WAREHOUSE_ID) {
  // Try the backend summary endpoint first
  let backendSummary = null
  try {
    const result = await api('GET', `/pwa-pt/dashboard-summary?warehouse_id=${warehouseId}`)
    backendSummary = result?.data || result || null
  } catch {
    backendSummary = null
  }

  // Always fetch inventory + cedis locally to keep the hub grid populated
  // (the backend summary may or may not include per-line breakdown)
  const [inventory, cedisList] = await Promise.allSettled([
    getInventory(warehouseId),
    getCedisList(),
  ])

  const inv = inventory.status === 'fulfilled' ? inventory.value : []
  const cedis = cedisList.status === 'fulfilled' ? cedisList.value : []

  const totalQty = inv.reduce((s, i) => s + (i.quantity || 0), 0)
  const totalKg = inv.reduce((s, i) => s + (i.total_kg || 0), 0)
  const totalProducts = inv.length

  // Group by line
  const byLine = {}
  for (const item of inv) {
    const key = item.line || 'OTRO'
    if (!byLine[key]) byLine[key] = { qty: 0, kg: 0, count: 0 }
    byLine[key].qty += item.quantity || 0
    byLine[key].kg += item.total_kg || 0
    byLine[key].count += 1
  }

  // Local inventory breakdown is authoritative for the hub KPIs;
  // backend summary provides the workflow counters (pending work, handover).
  //
  // Sebastián rollout 2026-04-10 expanded the dashboard with split buckets:
  //   pending_posting_count  — ya recibido físicamente, falta postear a stock
  //   pending_receipt_count  — declarado por producción, falta llegar físicamente
  // El total `pending_receptions` se mantiene por compatibilidad: suma de ambos.
  const pendingPosting = Number(backendSummary?.pending_posting_count || 0)
  const pendingReceipt = Number(backendSummary?.pending_receipt_count || 0)
  const pendingReceptionsTotal = pendingPosting + pendingReceipt ||
    Number(backendSummary?.pending_receptions || 0)

  return {
    date: new Date().toISOString().slice(0, 10),
    warehouse_id: warehouseId,
    inventory: {
      total_products: totalProducts,
      total_qty: totalQty,
      total_kg: totalKg,
      by_line: byLine,
    },
    cedis_available: cedis.length,
    pending_receptions: pendingReceptionsTotal,
    pending_posting: pendingPosting,
    pending_receipt: pendingReceipt,
    pending_transformations: Number(backendSummary?.pending_transformations || 0),
    pending_transfers: Number(backendSummary?.pending_transfers || 0),
    shift_handover_pending: Boolean(backendSummary?.shift_handover_pending || false),
    shift_handover_id: backendSummary?.shift_handover_id || null,
    backend_summary: backendSummary || null,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Next Action
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine the next suggested action for the almacenista.
 * Returns { action, label, route, color, count }
 *
 * Priorización con split buckets (rollout 2026-04-10):
 *   1. pending_posting (ya recibido, falta postear)  ← prioridad 1
 *   2. pending_receipt (declarado, esperando llegada) ← prioridad 2
 *   3. pending_transfers (surtir a CEDIS)
 *   4. pending_transformations
 *   5. inventario (fallback informativo)
 */
export function getNextAction(summary) {
  if ((summary.pending_posting || 0) > 0) {
    return {
      action: 'recepcion',
      label: 'Postear recepción a stock',
      route: '/almacen-pt/recepcion',
      color: '#f59e0b',
      count: summary.pending_posting,
    }
  }
  if ((summary.pending_receipt || 0) > 0) {
    return {
      action: 'recepcion',
      label: 'Recibir de producción',
      route: '/almacen-pt/recepcion',
      color: '#f59e0b',
      count: summary.pending_receipt,
    }
  }
  // Fallback al total por si el backend no envió el split aún
  if ((summary.pending_receptions || 0) > 0) {
    return { action: 'recepcion', label: 'Recibir de producción', route: '/almacen-pt/recepcion', color: '#f59e0b', count: summary.pending_receptions }
  }
  if (summary.pending_transfers > 0) {
    return { action: 'traspaso', label: 'Surtir a CEDIS', route: '/almacen-pt/traspaso', color: '#2B8FE0', count: summary.pending_transfers }
  }
  if (summary.pending_transformations > 0) {
    return { action: 'transformacion', label: 'Transformar producto', route: '/almacen-pt/transformacion', color: '#f59e0b', count: summary.pending_transformations }
  }
  return { action: 'inventario', label: 'Revisar inventario', route: '/almacen-pt/inventario', color: '#22c55e', count: summary.inventory?.total_products || 0 }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LOCAL CACHE — Reception history mirror (backend is LIVE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mirrors a confirmed reception into localStorage so the "Recepciones de hoy"
 * list stays populated across refreshes. Called AFTER the LIVE backend call
 * in `confirmReception()` succeeds (Sebastián rollout 2026-04-10 — D1/D4 via
 * gf.pt.reception / gf.packing.entry).
 *
 * Not used as a source of truth — the backend is authoritative. This exists
 * only to avoid a second round-trip to render the recent list immediately.
 */
export function saveReceptionLocal(reception) {
  const key = 'gf_pt_receptions'
  const existing = JSON.parse(localStorage.getItem(key) || '[]')
  const entry = {
    id: Date.now(),
    ...reception,
    timestamp: new Date().toISOString(),
  }
  existing.unshift(entry)
  // Keep last 200
  if (existing.length > 200) existing.length = 200
  localStorage.setItem(key, JSON.stringify(existing))
  return entry
}

/**
 * Get local reception log for today.
 */
export function getTodayReceptionsLocal() {
  const key = 'gf_pt_receptions'
  const all = JSON.parse(localStorage.getItem(key) || '[]')
  const today = new Date().toISOString().slice(0, 10)
  return all.filter(r => r.timestamp?.startsWith(today))
}

/**
 * Get all local receptions.
 */
export function getAllReceptionsLocal() {
  const key = 'gf_pt_receptions'
  return JSON.parse(localStorage.getItem(key) || '[]')
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Transfer to CEDIS (Sebastián commit 16341c5)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a PT → CEDIS transfer via the orchestration API.
 * @param {Object} transfer
 * @param {number} transfer.warehouse_id - source PT warehouse
 * @param {number} transfer.cedis_id     - destination CEDIS warehouse
 * @param {number} transfer.employee_id
 * @param {Array}  transfer.lines        - [{product_id, qty}]
 * @param {string} [transfer.notes]
 */
export async function createTransfer(transfer) {
  const result = await api('POST', '/pwa-pt/transfer-orchestrate', {
    warehouse_id: transfer.warehouse_id,
    cedis_id: transfer.cedis_id,
    employee_id: transfer.employee_id,
    lines: transfer.lines || [],
    notes: transfer.notes || '',
  })
  return result?.data || result
}

/**
 * Local log helper — mirrors a confirmed transfer into localStorage so the
 * "Traspasos de hoy" list sigue poblada incluso si el backend no responde
 * (fallback para la pantalla de Traspaso PT).
 * El endpoint oficial ahora es getTransfersHistory() → /api/pt/transfers/history.
 */
export function logTransferLocal(entry) {
  const key = 'gf_pt_transfers'
  const existing = JSON.parse(localStorage.getItem(key) || '[]')
  const row = {
    id: entry.backend_id || Date.now(),
    ...entry,
    timestamp: new Date().toISOString(),
  }
  existing.unshift(row)
  if (existing.length > 200) existing.length = 200
  localStorage.setItem(key, JSON.stringify(existing))
  return row
}

/**
 * Get local transfer log for today (fallback only).
 */
export function getTodayTransfersLocal() {
  const key = 'gf_pt_transfers'
  const all = JSON.parse(localStorage.getItem(key) || '[]')
  const today = new Date().toISOString().slice(0, 10)
  return all.filter(t => t.timestamp?.startsWith(today))
}

/**
 * Get transfers history PT→CEDIS from backend (Sebastián audit 2026-04-10).
 * Backend: GET /api/pt/transfers/history
 * Returns normalized list of transfer headers with line aggregation.
 *
 * @param {Object} [opts]
 * @param {number} [opts.warehouseId]  source PT warehouse (default = DEFAULT_WAREHOUSE_ID)
 * @param {string} [opts.dateFrom]     ISO date (YYYY-MM-DD)
 * @param {string} [opts.dateTo]       ISO date (YYYY-MM-DD)
 * @param {number} [opts.limit=50]
 * @param {number} [opts.offset=0]
 * @returns {Promise<Array>} list of { id, name, state, date, origin, destination, lines, ... }
 */
export async function getTransfersHistory({
  warehouseId = DEFAULT_WAREHOUSE_ID,
  dateFrom,
  dateTo,
  limit = 50,
  offset = 0,
} = {}) {
  const qs = new URLSearchParams({
    warehouse_id: String(warehouseId),
    limit: String(limit),
    offset: String(offset),
  })
  if (dateFrom) qs.set('date_from', dateFrom)
  if (dateTo) qs.set('date_to', dateTo)
  const result = await api('GET', `/pwa-pt/transfers-history?${qs}`)
  const payload = result?.data || result || {}
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.transfers)) return payload.transfers
  return []
}

/**
 * Get today's transfers PT→CEDIS from backend, with localStorage fallback
 * if the endpoint fails. Returns the same shape as getTodayTransfersLocal().
 */
export async function getTodayTransfers(warehouseId = DEFAULT_WAREHOUSE_ID) {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const rows = await getTransfersHistory({
      warehouseId,
      dateFrom: today,
      dateTo: today,
      limit: 100,
    })
    return Array.isArray(rows) ? rows : []
  } catch (err) {
    console.warn('[GFSC][ptService] getTodayTransfers backend fallback:', err?.message || err)
    return getTodayTransfersLocal()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Day sales by employee (Sebastián audit 2026-04-10)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get sales quantities by employee for a given day.
 * Backend: GET /api/pt/day-sales → sales_qty_by_employee_for_day()
 *
 * @param {Object} [opts]
 * @param {number} [opts.warehouseId]
 * @param {string} [opts.date]  ISO date (YYYY-MM-DD), defaults to today on backend
 * @returns {Promise<{ date: string, warehouse_id: number, items: Array }>}
 */
export async function getDaySales({ warehouseId = DEFAULT_WAREHOUSE_ID, date } = {}) {
  const qs = new URLSearchParams({ warehouse_id: String(warehouseId) })
  if (date) qs.set('date', date)
  const result = await api('GET', `/pwa-pt/day-sales?${qs}`)
  const payload = result?.data || result || {}
  return {
    date: payload.date || date || new Date().toISOString().slice(0, 10),
    warehouse_id: payload.warehouse_id || warehouseId,
    items: Array.isArray(payload.items) ? payload.items
         : Array.isArray(payload) ? payload
         : [],
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Shift Handover (Sebastián commit a3f58c0, reuses gf.shift.handover)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create shift handover (outgoing almacenista declares inventory).
 * Uses the same shift_handover endpoint as entregas, scoped by warehouse_id.
 */
export async function createShiftHandover(warehouseId, employeeId, lines, notes) {
  const result = await api('POST', '/pwa-pt/shift-handover-create', {
    warehouse_id: warehouseId,
    employee_id: employeeId,
    lines: lines || [],
    notes: notes || '',
  })
  return result?.data || result
}

/**
 * Get pending handover for this warehouse.
 * Returns null when there is no pending handover.
 */
export async function getPendingHandover(warehouseId) {
  try {
    const result = await api('GET', `/pwa-pt/shift-handover-pending?warehouse_id=${warehouseId}`)
    const payload = result?.data || result
    if (!payload || Array.isArray(payload) && payload.length === 0) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Accept shift handover (incoming almacenista validates).
 * action: 'accept' | 'reject'
 */
export async function acceptShiftHandover(handoverId, employeeId, lines, notes, action = 'accept') {
  const result = await api('POST', '/pwa-pt/shift-handover-accept', {
    handover_id: handoverId,
    employee_id: employeeId,
    lines: lines || [],
    notes: notes || '',
    action,
  })
  return result?.data || result
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Reception (Sebastián rollout 2026-04-10 — D1/D4)
//  Backend decisión: reception stays on gf.packing.entry + gf.inventory.posting.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get pending receptions from production, split into two buckets:
 *   pending_posting  — physically received, waiting for inventory posting
 *   pending_receipt  — declared by production, waiting to arrive physically
 *
 * Backend aggregates from gf.packing.entry. Array shape may be either:
 *   { pending_posting: [...], pending_receipt: [...] }
 * or a flat list with a `bucket` field. We normalize to the object form.
 */
export async function getPendingReceptions(warehouseId) {
  try {
    const result = await api('GET', `/pwa-pt/reception-pending?warehouse_id=${warehouseId || DEFAULT_WAREHOUSE_ID}`)
    const payload = result?.data || result || {}

    // Shape A: already split
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return {
        pending_posting: Array.isArray(payload.pending_posting) ? payload.pending_posting : [],
        pending_receipt: Array.isArray(payload.pending_receipt) ? payload.pending_receipt : [],
      }
    }
    // Shape B: flat list with bucket discriminator
    if (Array.isArray(payload)) {
      const grouped = { pending_posting: [], pending_receipt: [] }
      for (const row of payload) {
        const bucket = row.bucket || row.state || 'pending_receipt'
        if (bucket === 'pending_posting') grouped.pending_posting.push(row)
        else grouped.pending_receipt.push(row)
      }
      return grouped
    }
    return { pending_posting: [], pending_receipt: [] }
  } catch (e) {
    console.warn('[getPendingReceptions] fallback empty:', e?.message)
    return { pending_posting: [], pending_receipt: [] }
  }
}

/**
 * Confirm a reception. Backend persists via gf.packing.entry →
 * gf.inventory.posting (no duplicate stock.move).
 *
 * Payload shape accepted:
 *   { packing_entry_id?, product_id, qty_reported?, qty_received,
 *     difference?, difference_pct?, notes?, employee_id?, warehouse_id?, lines? }
 */
export async function confirmReception(data = {}) {
  const result = await api('POST', '/pwa-pt/reception-create', {
    warehouse_id: data.warehouse_id || DEFAULT_WAREHOUSE_ID,
    employee_id: data.employee_id,
    packing_entry_id: data.packing_entry_id,
    product_id: data.product_id,
    qty_reported: data.qty_reported,
    qty_received: data.qty_received,
    difference: data.difference,
    difference_pct: data.difference_pct,
    notes: data.notes || '',
    lines: data.lines,
  })
  return result?.data || result
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Transformation (Sebastián rollout 2026-04-10 — D6)
//  Backend: existing gf.transformation.order model.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get pending transformation orders for this warehouse.
 * Backend aggregates by gf.transformation.order state.
 */
export async function getPendingTransformations(warehouseId) {
  try {
    const result = await api('GET', `/pwa-pt/transformation-pending?warehouse_id=${warehouseId || DEFAULT_WAREHOUSE_ID}`)
    const payload = result?.data || result || []
    return Array.isArray(payload) ? payload : []
  } catch (e) {
    console.warn('[getPendingTransformations] fallback empty:', e?.message)
    return []
  }
}

/**
 * Create a transformation order (e.g. BARRA GRANDE → 1/2 BARRA GRANDE).
 * Persists to gf.transformation.order.
 *
 * Payload shape accepted:
 *   { from_product_id, to_product_id, qty, notes?, employee_id?, warehouse_id?, lines? }
 */
export async function createTransformation(data = {}) {
  const result = await api('POST', '/pwa-pt/transformation-create', {
    warehouse_id: data.warehouse_id || DEFAULT_WAREHOUSE_ID,
    employee_id: data.employee_id,
    from_product_id: data.from_product_id,
    to_product_id: data.to_product_id,
    qty: data.qty,
    notes: data.notes || '',
    lines: data.lines,
  })
  return result?.data || result
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Scrap / Merma (Sebastián commit 56c064e, PT reasons in catalog)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register scrap in stock.scrap for the PT warehouse.
 * Reuses the entregas warehouse_scrap endpoint (scoped by warehouse_id).
 */
export async function createScrap(warehouseId, employeeId, productId, qty, reasonTag, notes) {
  const result = await api('POST', '/pwa-pt/scrap-create', {
    warehouse_id: warehouseId,
    employee_id: employeeId,
    product_id: productId,
    scrap_qty: qty,
    reason_tag: reasonTag || '',
    notes: notes || '',
  })
  return result?.data || result
}

/**
 * Get available scrap reasons (PT-enabled reasons from production catalog).
 * Returns [{id, name}, ...]
 */
export async function getScrapReasons() {
  try {
    const result = await api('GET', '/pwa-pt/scrap-reasons')
    return result?.data || result || []
  } catch {
    return []
  }
}

/**
 * Historial de mermas del día para este almacén PT.
 */
export async function getScrapHistory(warehouseId = DEFAULT_WAREHOUSE_ID) {
  try {
    const result = await api('GET', `/pwa-pt/scrap-history?warehouse_id=${warehouseId}`)
    const items = result?.data || result || []
    if (!Array.isArray(items)) return []
    return items.map(s => ({
      id: s.id,
      product: s.product_name || s.product_id?.[1] || 'Producto',
      product_id: s.product_id?.[0] || s.product_id || 0,
      reason: s.reason_tag || s.origin || '',
      qty: s.scrap_qty || s.quantity || 0,
      time: s.create_date ? s.create_date.split(' ')[1]?.slice(0, 5) || s.create_date : '',
      create_date: s.create_date || '',
      notes: s.notes || '',
    }))
  } catch {
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Forecast Requests (Sebastián rollout 2026-04-10 — D10)
//  Backend: gf_saleops/controllers/pt.py
//    - Warehouse → analytic resolution
//    - Scope precedence: employee > branch > global
//    - Uses existing gf.saleops.forecast with line aggregation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get forecast/transfer requests for this PT warehouse.
 * Employee scope takes precedence over branch scope (backend handles).
 * @param {number} warehouseId
 * @param {number} [employeeId] — optional override, defaults to session employee
 */
export async function getForecastRequests(warehouseId, employeeId) {
  try {
    const params = new URLSearchParams()
    params.set('warehouse_id', String(warehouseId || DEFAULT_WAREHOUSE_ID))
    if (employeeId) params.set('employee_id', String(employeeId))
    const result = await api('GET', `/pwa-pt/forecast-pending?${params.toString()}`)
    const payload = result?.data || result || []
    return Array.isArray(payload) ? payload : (payload?.lines || [])
  } catch (e) {
    console.warn('[getForecastRequests] fallback empty:', e?.message)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Get product weight from known products list */
function getProductWeight(productId) {
  const found = KNOWN_PRODUCTS.find(p => p.id === productId)
  return found ? found.weight : 1
}

/** Compute FIFO status for an in_date */
export function getFIFOStatus(inDate) {
  if (!inDate) return { status: 'unknown', label: 'Sin fecha', color: 'rgba(255,255,255,0.4)', days: null }
  const now = new Date()
  const then = new Date(inDate)
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24))
  if (days <= FIFO_THRESHOLDS.ok) return { status: 'ok', label: `${days}d`, color: '#22c55e', days }
  if (days <= FIFO_THRESHOLDS.warn) return { status: 'warn', label: `${days}d`, color: '#f59e0b', days }
  return { status: 'old', label: `${days}d`, color: '#ef4444', days }
}

/** Format number with comma thousands */
export function fmtNum(n) {
  if (n == null || isNaN(n)) return '0'
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })
}

/** Format kg */
export function fmtKg(n) {
  if (n == null || isNaN(n)) return '0 kg'
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 }) + ' kg'
}
