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
import {
  derivePtBlockState,
  normalizePendingPtHandover,
  translatePtBlockedError,
} from './ptHandoverState'

// ── Constants ────────────────────────────────────────────────────────────────

/** Default warehouse: Planta Iguala */
export const DEFAULT_WAREHOUSE_ID = 76

/** Destino operativo fijo para PT -> Entregas. Backend resuelve el ID real. */
export const ENTREGAS_DESTINATION_LABEL = 'CIGU/Existencias'
export const ENTREGAS_DESTINATION_COMPANY = 'SOLUCIONES EN PRODUCCION GLACIEM'

/** FIFO thresholds (days) */
export const FIFO_THRESHOLDS = { ok: 3, warn: 7 }

function toReadablePtError(error) {
  const message = error?.message || String(error || '')
  return translatePtBlockedError(message)
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Inventory (stock.quant)  — BFF canonical single source of truth
// ═══════════════════════════════════════════════════════════════════════════════
//
// Todas las pantallas PT consumen el inventario desde UNA sola salida canónica
// producida por `/pwa-pt/inventory` en `src/lib/api.js`. El BFF ya:
//   - Resuelve ubicaciones PT dinámicamente (sin IDs hardcoded).
//   - Filtra productos por categoría estructural (no regex de nombre).
//   - Deduplica por product_id sumando cantidades entre ubicaciones.
//   - Excluye MP y cantidades ≤ 0.
//   - Calcula weight_per_unit parseando el nombre (fallback 1).
//
// Este servicio sólo hace:
//   1. Fetch + cache resiliente en localStorage.
//   2. Exponer la forma canónica (`getInventoryCanonical`) para pantallas que
//      necesitan totales/by_family.
//   3. Exponer la lista plana `items[]` (`getInventory`) para pantallas que
//      solo necesitan iterar productos.
//
// Cada item del canonical incluye:
//   product_family   → 'BARRA' | 'ROLITO' | 'OTRO'  (estructural, por categoría)
//   display_line     → alias UI de product_family
//   stock_locations  → distribución física real (NO se usa para clasificar)
//
// Nadie más debe reconstruir agregados, reclasificar por ubicación, ni
// filtrar MP aquí.

const INVENTORY_CACHE_KEY = 'gf_pt_inventory_cache_v1'
/** Cache TTL: 5 min — cache sólo es fallback, no fuente primaria */
const INVENTORY_CACHE_TTL_MS = 5 * 60 * 1000
/** Cache stale limit: 24 h — después de esto el fallback deja de servir */
const INVENTORY_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000

function readInventoryCache(warehouseId) {
  try {
    const raw = localStorage.getItem(INVENTORY_CACHE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (!entry || entry.warehouse_id !== warehouseId) return null
    const age = Date.now() - Number(entry.ts || 0)
    if (age > INVENTORY_CACHE_MAX_STALE_MS) return null
    return { data: entry.data, age, fresh: age <= INVENTORY_CACHE_TTL_MS }
  } catch {
    return null
  }
}

function writeInventoryCache(warehouseId, data) {
  try {
    localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify({
      warehouse_id: warehouseId,
      ts: Date.now(),
      data,
    }))
  } catch {
    /* storage lleno o deshabilitado — cache silenciosa */
  }
}

/**
 * Forma canónica vacía (fallback de emergencia).
 */
function emptyInventoryShape(warehouseId) {
  return {
    warehouse_id: warehouseId,
    warehouse_name: '',
    pt_locations: [],
    items: [],
    totals: { products: 0, qty: 0, kg: 0, by_family: {}, by_location: {} },
    by_family: {},
    generated_at: new Date().toISOString(),
    _source: 'empty',
  }
}

/**
 * Devuelve la forma canónica completa del inventario PT:
 *   { warehouse_id, warehouse_name, pt_locations, items, totals, by_family, generated_at, _source }
 *
 * Estrategia de resiliencia:
 *   1. Intenta fetch fresco al BFF.
 *   2. En éxito: escribe cache + retorna con _source='live'.
 *   3. En error: devuelve cache si existe (<24h) con _source='cache-stale' o
 *      'cache-fresh' según edad. Si no hay cache, re-lanza el error.
 *
 * Roadmap offline: este wrapper es el único punto por donde pasa el inventario,
 * así que cuando se agregue IndexedDB sólo se toca aquí.
 */
export async function getInventoryCanonical(warehouseId = DEFAULT_WAREHOUSE_ID) {
  try {
    const res = await api('GET', `/pwa-pt/inventory?warehouse_id=${warehouseId}`)
    // El BFF siempre regresa la forma canónica. Validación defensiva:
    if (res && Array.isArray(res.items)) {
      const data = { ...res, _source: 'live' }
      writeInventoryCache(warehouseId, data)
      return data
    }
    // Shape inesperada → caer al cache
    throw new Error('Inventory response shape invalid')
  } catch (err) {
    const cached = readInventoryCache(warehouseId)
    if (cached) {
      return {
        ...cached.data,
        _source: cached.fresh ? 'cache-fresh' : 'cache-stale',
        _cache_age_ms: cached.age,
      }
    }
    // Sin cache: devolvemos forma vacía para que la UI no crashee,
    // anotando el error para logging.
    console.warn('[ptService] getInventoryCanonical failed, no cache:', err?.message || err)
    return { ...emptyInventoryShape(warehouseId), _source: 'error', _error: err?.message || String(err) }
  }
}

/**
 * Lista plana de productos PT para las pantallas que solo necesitan iterar.
 * Cada item ya viene deduplicado, con weight_per_unit parseado y total_kg listo.
 * Shape de cada item:
 *   { product_id, product_name, product, category_id, category_name,
 *     product_family, display_line, family_root_id, family_root_name,
 *     weight_per_unit, quantity, total_kg, stock_locations: [...] }
 *
 * `product` se duplica de `product_name` para retrocompatibilidad con pantallas
 * existentes; nuevas pantallas deben usar `product_name`.
 */
export async function getInventory(warehouseId = DEFAULT_WAREHOUSE_ID) {
  const canonical = await getInventoryCanonical(warehouseId)
  return (canonical.items || []).map((item) => ({
    ...item,
    product: item.product_name, // alias retrocompat
  }))
}

/**
 * Inventario agrupado por FAMILIA estructural (BARRA / ROLITO / OTRO)
 * para pantallas que renderizan secciones por línea operativa.
 *
 * IMPORTANTE: la agrupación se hace por `product_family` (categoría
 * estructural del producto) y NO por la ubicación física donde está el
 * stock. La distribución física aparece sólo como metadato informativo.
 *
 * El shape de salida conserva la clave histórica `line` para no romper
 * las pantallas que ya iteran por `group.line`, pero su valor ahora es
 * la familia estructural (idéntica a `group.family`).
 */
export async function getInventoryGrouped(warehouseId = DEFAULT_WAREHOUSE_ID) {
  const canonical = await getInventoryCanonical(warehouseId)
  const groups = {}
  for (const item of canonical.items || []) {
    const family = item.product_family || 'OTRO'
    if (!groups[family]) {
      groups[family] = {
        family,
        line: family,          // alias para pantallas existentes
        location: '',          // nombre representativo de ubicación física
        items: [],
        total_qty: 0,
        total_kg: 0,
      }
    }
    groups[family].items.push({ ...item, product: item.product_name })
    groups[family].total_qty += item.quantity || 0
    groups[family].total_kg += item.total_kg || 0
  }
  // location label (ubicación física donde está la mayor parte del stock
  // de esta familia — sólo para mostrar contexto, no para clasificar)
  for (const g of Object.values(groups)) {
    const locQty = {}
    for (const it of g.items) {
      for (const sl of it.stock_locations || []) {
        locQty[sl.name] = (locQty[sl.name] || 0) + (sl.qty || 0)
      }
    }
    const dominant = Object.entries(locQty).sort((a, b) => b[1] - a[1])[0]
    g.location = dominant ? dominant[0] : ''
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

/**
 * Warehouse destino fijo para el flujo PT -> almacen de entregas.
 * El frontend no debe dejar que el almacenista PT elija un CEDIS manualmente.
 */
export async function getEntregasDestination() {
  const result = await api('GET', '/pwa-pt/entregas-destination')
  const payload = result?.data || result || {}
  return {
    id: Number(payload.id || payload.warehouse_id || 0),
    warehouse_id: Number(payload.warehouse_id || payload.id || 0),
    name: payload.display_name || payload.name || ENTREGAS_DESTINATION_LABEL,
    code: payload.code || 'CIGU',
    company_id: payload.company_id || 0,
    company_name: payload.company_name || ENTREGAS_DESTINATION_COMPANY,
  }
}

export async function getPendingPtTransfers(warehouseId) {
  const result = await api('GET', `/pwa-pt/pending-transfers?warehouse_id=${warehouseId}`)
  const payload = result?.data || result || {}
  const pickings = payload?.pickings || payload?.items || payload
  return Array.isArray(pickings) ? pickings : []
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

  // Inventario canónico desde BFF + CEDIS. Ambos en Promise.allSettled para
  // que una falla en CEDIS no impida pintar el hub.
  const [invCanonical, cedisList] = await Promise.allSettled([
    getInventoryCanonical(warehouseId),
    getCedisList(),
  ])

  const canonical = invCanonical.status === 'fulfilled' ? invCanonical.value : emptyInventoryShape(warehouseId)
  const cedis = cedisList.status === 'fulfilled' ? cedisList.value : []

  // Totales y by_family vienen ya calculados por el BFF — no se reagregan aquí.
  // by_family es la clasificación estructural (categoría del producto),
  // NO la física (ubicación del stock). El hub muestra los totales por
  // familia operativa ROLITO vs BARRA, no por ubicación.
  const totalQty = canonical.totals?.qty || 0
  const totalKg = canonical.totals?.kg || 0
  const totalProducts = canonical.totals?.products || 0
  const byFamily = canonical.by_family || canonical.totals?.by_family || {}
  const byLocation = canonical.totals?.by_location || {}

  // Local inventory breakdown is authoritative for the hub KPIs;
  // backend summary provides the workflow counters (pending work, handover).
  //
  // Sebastián rollout 2026-04-10 expanded the dashboard with split buckets:
  //   pending_posting_count  — ya recibido físicamente, falta postear a stock
  //   pending_receipt_count  — declarado por producción, falta llegar físicamente
  // El total `pending_receptions` se mantiene por compatibilidad: suma de ambos.
  //
  // Backend real field names (confirmado 2026-04-11 en vivo):
  //   pending_posting_count, pending_receipt_count,
  //   pending_handovers, transfers_today, transformations_today,
  //   transformed_kg_total, warehouse_name, shift_count, date
  const pendingPosting = Number(backendSummary?.pending_posting_count || 0)
  const pendingReceipt = Number(backendSummary?.pending_receipt_count || 0)
  const pendingReceptionsTotal = pendingPosting + pendingReceipt ||
    Number(backendSummary?.pending_receptions || 0)

  const pendingTransfers = Number(
    backendSummary?.pending_transfers ?? backendSummary?.transfers_today ?? 0
  )
  const pendingTransformations = Number(
    backendSummary?.pending_transformations ?? backendSummary?.transformations_today ?? 0
  )
  const handoverCount = Number(backendSummary?.pending_handovers || 0)
  const handoverPending = backendSummary?.shift_handover_pending != null
    ? Boolean(backendSummary.shift_handover_pending)
    : handoverCount > 0
  const blockState = derivePtBlockState({
    summary: backendSummary || {},
    handover: handoverPending ? normalizePendingPtHandover({
      id: backendSummary?.shift_handover_id || null,
      warehouse_blocked: backendSummary?.pt_blocked_by_handover,
      required_after_supervisor_close: backendSummary?.shift_handover_required_after_close,
      count_submitted: backendSummary?.count_submitted,
      source_shift_id: backendSummary?.source_shift_id || null,
    }) : null,
  })

  return {
    date: backendSummary?.date || new Date().toISOString().slice(0, 10),
    warehouse_id: warehouseId,
    warehouse_name: backendSummary?.warehouse_name || '',
    inventory: {
      total_products: totalProducts,
      total_qty: totalQty,
      total_kg: totalKg,
      by_family: byFamily,
      by_location: byLocation,
    },
    cedis_available: cedis.length,
    pending_receptions: pendingReceptionsTotal,
    pending_posting: pendingPosting,
    pending_receipt: pendingReceipt,
    pending_transformations: pendingTransformations,
    pending_transfers: pendingTransfers,
    transformed_kg_total: Number(backendSummary?.transformed_kg_total || 0),
    shift_count: Number(backendSummary?.shift_count || 0),
    shift_handover_pending: handoverPending,
    shift_handover_required_after_close: Boolean(
      backendSummary?.shift_handover_required_after_close
        ?? backendSummary?.required_after_supervisor_close
    ),
    shift_handover_id: backendSummary?.shift_handover_id || null,
    pt_blocked_by_handover: blockState.blocked,
    pt_block_reason: blockState.reason,
    backend_summary: backendSummary || null,
    // Propaga el origen del inventario (live|cache-fresh|cache-stale|error)
    // para que el hub pueda mostrar un badge "datos en cache" si aplica.
    inventory_source: canonical._source || 'unknown',
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
    return { action: 'traspaso', label: 'Transferir a Entregas', route: '/almacen-pt/traspaso', color: '#2B8FE0', count: summary.pending_transfers }
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
  try {
    const result = await api('POST', '/pwa-pt/transfer-orchestrate', {
      warehouse_id: transfer.warehouse_id,
      cedis_id: transfer.cedis_id,
      destination_warehouse_id: transfer.destination_warehouse_id || transfer.cedis_id,
      employee_id: transfer.employee_id,
      lines: transfer.lines || [],
      notes: transfer.notes || '',
    })
    return result?.data || result
  } catch (error) {
    throw new Error(toReadablePtError(error))
  }
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
    destination_warehouse_id: entry.destination_warehouse_id || entry.cedis_id || 0,
    pending_validation: entry.pending_validation ?? true,
    sync_state: entry.sync_state || (entry.backend_id ? 'backend_pending' : 'local_pending_only'),
    resolved_at: entry.resolved_at || null,
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

export function getPendingTransferReservationMap({ warehouseId, destinationWarehouseId } = {}) {
  const items = getTodayTransfersLocal().filter((row) => {
    if (warehouseId && Number(row.warehouse_id || 0) !== Number(warehouseId)) return false
    if (destinationWarehouseId && Number(row.destination_warehouse_id || row.cedis_id || 0) !== Number(destinationWarehouseId)) return false
    return row.pending_validation !== false
  })
  const reservation = {}
  for (const row of items) {
    for (const line of Array.isArray(row.lines) ? row.lines : []) {
      const productId = Number(line.product_id || 0)
      const qty = Number(line.qty || line.quantity || 0)
      if (productId > 0 && qty > 0) {
        reservation[productId] = (reservation[productId] || 0) + qty
      }
    }
  }
  return reservation
}

export function resolveLocalTransferByPicking(pickingId, action = 'accepted') {
  const key = 'gf_pt_transfers'
  const all = JSON.parse(localStorage.getItem(key) || '[]')
  let changed = false
  const next = all.map((row) => {
    if (Number(row.backend_id || row.id || 0) !== Number(pickingId || 0)) return row
    changed = true
    return {
      ...row,
      pending_validation: false,
      resolved_action: action,
      resolved_at: new Date().toISOString(),
    }
  })
  if (changed) localStorage.setItem(key, JSON.stringify(next))
  return changed
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
 * Resuelve los warehouse_ids del handover PT (rolito + barra cuando existan).
 * Para Iguala hoy es solo [warehouseId] — backend consolida sub-locations.
 * Si la sesion expone session.pt_warehouse_ids, se usan esos.
 */
function resolvePtWarehouseIds(warehouseId, extra) {
  const ids = []
  if (Array.isArray(extra)) {
    for (const v of extra) {
      const n = Number(v)
      if (n && !ids.includes(n)) ids.push(n)
    }
  }
  const primary = Number(warehouseId)
  if (primary && !ids.includes(primary)) ids.unshift(primary)
  return ids
}

/**
 * Create shift handover PT (outgoing almacenista declares inventory).
 * Mismo endpoint que entregas, pero PWA agrega handover_scope='pt' y
 * warehouse_ids para que backend consolide rolito+barra.
 */
export async function createShiftHandover(warehouseId, employeeId, lines, notes, options = {}) {
  const result = await api('POST', '/pwa-pt/shift-handover-create', {
    warehouse_id: warehouseId,
    warehouse_ids: resolvePtWarehouseIds(warehouseId, options?.warehouse_ids),
    handover_scope: 'pt',
    employee_id: employeeId,
    shift_in_employee_id: options?.shift_in_employee_id || undefined,
    lines: lines || [],
    notes: notes || '',
    handover_id: options?.handover_id || undefined,
    required_after_supervisor_close: options?.required_after_supervisor_close || undefined,
  })
  return result?.data || result
}

/**
 * Get pending handover PT for this warehouse (consolidado rolito+barra).
 * Returns null cuando no hay pendiente.
 */
export async function getPendingHandover(warehouseId, options = {}) {
  try {
    const qs = new URLSearchParams({ warehouse_id: String(warehouseId) })
    qs.set('handover_scope', 'pt')
    const ids = resolvePtWarehouseIds(warehouseId, options?.warehouse_ids)
    if (ids.length > 1) qs.set('warehouse_ids', ids.join(','))
    const result = await api('GET', `/pwa-pt/shift-handover-pending?${qs.toString()}`)
    const payload = result?.data || result
    const handover = payload?.handover || payload
    if (!handover || Array.isArray(handover) && handover.length === 0) return null
    return normalizePendingPtHandover(handover)
  } catch {
    return null
  }
}

/**
 * Accept shift handover PT (incoming almacenista validates).
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

/**
 * Empleados elegibles para recibir el turno PT (mismo warehouse, job
 * Almacenista PT, excluyendo al saliente). Backend exige shift_in_employee_id
 * en handover/create — el saliente debe seleccionar al receptor.
 */
export async function getEligibleReceivers(warehouseId, excludeEmployeeId) {
  if (!warehouseId) return []
  const params = new URLSearchParams({ warehouse_id: String(warehouseId) })
  if (excludeEmployeeId) params.set('exclude_employee_id', String(excludeEmployeeId))
  try {
    const result = await api('GET', `/pwa-pt/eligible-receivers?${params.toString()}`)
    return Array.isArray(result) ? result : []
  } catch {
    return []
  }
}

/**
 * PT shift status — fuente de verdad sobre ownership/blocked/pending.
 * Backend devuelve view: 'dashboard' | 'blocked' | 'receive_turn'.
 * La PWA NO debe decidir ownership por su cuenta.
 */
export async function getPtShiftStatus({ warehouseId, employeeId, warehouseIds } = {}) {
  const result = await api('POST', '/pwa-pt/shift-status', {
    warehouse_id: warehouseId,
    warehouse_ids: resolvePtWarehouseIds(warehouseId, warehouseIds),
    employee_id: employeeId,
  })
  const payload = result?.data || result || {}
  return {
    view: payload.view || 'dashboard',
    blocked: Boolean(payload.blocked),
    pending_for_me: Boolean(payload.pending_for_me),
    owner_employee_id: Number(payload.owner_employee_id || 0) || null,
    owner_employee_name: payload.owner_employee_name || '',
    handover_id: Number(payload.handover_id || 0) || null,
    handover: payload.handover || null,
    raw: payload,
  }
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
 *   { packing_entry_id?, packing_entry_ids?, received_lines?, product_id, qty_reported?, qty_received,
 *     difference?, difference_pct?, notes?, employee_id?, warehouse_id?, lines? }
 */
export async function confirmReception(data = {}) {
  try {
    const result = await api('POST', '/pwa-pt/reception-create', {
      warehouse_id: data.warehouse_id || DEFAULT_WAREHOUSE_ID,
      employee_id: data.employee_id,
      shift_id: data.shift_id,
      packing_entry_id: data.packing_entry_id,
      packing_entry_ids: Array.isArray(data.packing_entry_ids) ? data.packing_entry_ids : undefined,
      product_id: data.product_id,
      qty_reported: data.qty_reported,
      qty_received: data.qty_received,
      difference: data.difference,
      difference_pct: data.difference_pct,
      notes: data.notes || '',
      lines: data.lines,
      received_lines: Array.isArray(data.received_lines) ? data.received_lines : undefined,
    })
    return result?.data || result
  } catch (error) {
    throw new Error(toReadablePtError(error))
  }
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
  try {
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
  } catch (error) {
    throw new Error(toReadablePtError(error))
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Scrap / Merma (Sebastián commit 56c064e, PT reasons in catalog)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register scrap in stock.scrap for the PT warehouse.
 * Reuses the entregas warehouse_scrap endpoint (scoped by warehouse_id).
 */
export async function createScrap(warehouseId, employeeId, productId, qty, reasonTag, notes) {
  try {
    const result = await api('POST', '/pwa-pt/scrap-create', {
      warehouse_id: warehouseId,
      employee_id: employeeId,
      product_id: productId,
      scrap_qty: qty,
      reason_tag: reasonTag || '',
      notes: notes || '',
    })
    return result?.data || result
  } catch (error) {
    throw new Error(toReadablePtError(error))
  }
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
