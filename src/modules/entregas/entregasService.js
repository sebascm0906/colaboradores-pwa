// entregasService.js — V2 Adapter Layer
// ═══════════════════════════════════════════════════════════════════════════════
// TRAZABILIDAD DE DATOS (2026-04-09):
// ┌──────────────────────┬──────────────────────────────────────┬──────────────┐
// │ Dato                 │ Fuente                               │ Estado       │
// ├──────────────────────┼──────────────────────────────────────┼──────────────┤
// │ Day summary          │ /gf/.../entregas/day_summary         │ LIVE         │
// │  (fallback)          │ Composite de 5 endpoints existentes  │ LIVE         │
// │ Pallets pendientes   │ pwa-pt/pending-pallets (stock.quant) │ LIVE         │
// │ Aceptar/rechazar PT  │ pwa-pt/accept-pallet, reject-pallet │ LIVE         │
// │ Rutas del día        │ pwa-entregas/today-routes (gf.route) │ LIVE         │
// │ Confirmar carga      │ pwa-entregas/confirm-load            │ LIVE         │
// │ Detalle carga        │ pwa-ruta/load-lines (stock.picking)  │ LIVE         │
// │ Buscar ticket        │ pwa-admin/find-ticket (sale.order)   │ LIVE         │
// │ Despachar ticket     │ pwa-admin/dispatch-ticket             │ LIVE         │
// │ Tickets pendientes   │ pwa-admin/pending-tickets            │ LIVE         │
// │ Inventario CEDIS     │ pwa-pt/inventory (stock.quant)       │ LIVE         │
// │ Devoluciones (leer)  │ pwa-entregas/returns (gf.route.stop) │ LIVE         │
// │ Aceptar devolución   │ /gf/.../route_return/accept          │ LIVE         │
// │ Crear merma          │ /gf/.../warehouse_scrap/create       │ LIVE         │
// │ Crear handover       │ /gf/.../shift_handover/create        │ LIVE         │
// │ Handover pendiente   │ /gf/.../shift_handover/pending       │ LIVE         │
// │ Aceptar handover     │ /gf/.../shift_handover/accept        │ LIVE         │
// │ Historial merma      │ stock.scrap via readModelSorted      │ LIVE         │
// └──────────────────────┴──────────────────────────────────────┴──────────────┘
//
// Todos los endpoints se resuelven via directEntregas() en lib/api.js
// como proxies a:
//   - JSON-RPC genérico (readModelSorted / createUpdate) para datos existentes
//   - Controllers de Sebastián (/gf/logistics/api/employee/*) para funciones nuevas
// ═══════════════════════════════════════════════════════════════════════════════

import { api } from '../../lib/api'

// ── STEP STATUS CONSTANTS ───────────────────────────────────────────────────

/** Status values used by the stepper UI to render each workflow step. */
export const STEP_STATUS = {
  LOCKED: 'locked',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ALERT: 'alert',
}

// ═════════════════════════════════════════════════════════════════════════════
//  LIVE — Day Summary
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build day summary. Tries Sebastián's dedicated endpoint first;
 * falls back to composite aggregation if the controller isn't deployed yet.
 *
 * @param {number} warehouseId - Odoo warehouse ID
 * @returns {Promise<Object>} Aggregated summary object
 */
export async function getDaySummary(warehouseId) {
  // Try dedicated backend endpoint first
  try {
    const result = await api('GET', `/pwa-entregas/day-summary?warehouse_id=${warehouseId}`)
    if (result && typeof result === 'object' && !result.error) {
      return result
    }
  } catch {
    // Controller not deployed yet — fall back to composite
  }

  // Fallback: composite aggregation from existing endpoints
  const [routes, pending, returns, transfers, handover] = await Promise.allSettled([
    api('GET', `/pwa-entregas/today-routes?warehouse_id=${warehouseId}`),
    api('GET', `/pwa-admin/pending-tickets?warehouse_id=${warehouseId}`),
    api('GET', `/pwa-entregas/returns?warehouse_id=${warehouseId}`),
    getPendingTransfers(warehouseId),
    getPendingHandover(warehouseId),
  ])

  const safe = (result) =>
    result.status === 'fulfilled' && Array.isArray(result.value)
      ? result.value
      : []

  const routeData = safe(routes)
  const pendingData = safe(pending)
  const returnData = safe(returns)
  const transferData = transfers.status === 'fulfilled' && Array.isArray(transfers.value) ? transfers.value : []
  const handoverData = handover.status === 'fulfilled' ? handover.value : null

  return {
    date: new Date().toISOString().slice(0, 10),
    warehouse_id: warehouseId,
    pending_pallets: transferData.length,
    routes_total: routeData.length,
    routes_sealed: routeData.filter((r) => r.load_sealed).length,
    routes_pending: routeData.filter((r) => !r.load_sealed).length,
    pending_tickets: pendingData.length,
    pending_returns: returnData.filter((r) => r.state !== 'done').length,
    scraps_today: 0, // Not available in composite mode
    shift_handover_pending: !!handoverData,
    shift_handover_from: handoverData?.shift_out_employee || handoverData?.employee_name || null,
    shift_accepted_today: false, // Cannot determine in composite mode
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LIVE — PT → CEDIS transfers (stock.picking transactional)
//  Sebastian rollout 2026-04-19: reemplaza el legacy gf.pallet (deprecated).
//  Backend: /gf/logistics/api/employee/pt_transfer/{pending,accept,reject}
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Transferencias PT pendientes para este CEDIS.
 * Backend devuelve stock.picking destino al warehouse del almacenista,
 * con sus moves (lineas de producto) y datos para mostrar en pantalla.
 * @param {number} warehouseId
 * @returns {Promise<Array<{id:number, name:string, origin?:string,
 *   scheduled_date?:string, state?:string, location_src?:string,
 *   location_dest?:string, moves?:Array<{product_id:number, product_name:string,
 *   qty_demand:number, uom?:string}>}>>}
 */
export async function getPendingTransfers(warehouseId) {
  try {
    const result = await api('GET', `/pwa-pt/pending-transfers?warehouse_id=${warehouseId}`)
    const items = result?.data?.pickings || result?.pickings || result?.data || result || []
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

/**
 * Aceptar transferencia: backend ejecuta picking.button_validate() (movimiento real).
 * Precondicion backend: stock 'assigned' en origen.
 * @param {number} pickingId
 * @returns {Promise<{ok:boolean, error?:string, picking_id?:number, state?:string}>}
 */
export async function acceptTransfer(pickingId) {
  return api('POST', '/pwa-pt/accept-transfer', { picking_id: pickingId })
}

/**
 * Rechazar transferencia con motivo obligatorio.
 * Backend cancela el picking y registra el motivo.
 * @param {number} pickingId
 * @param {string} reason - obligatorio
 * @returns {Promise<{ok:boolean, error?:string, picking_id?:number, state?:string}>}
 */
export async function rejectTransfer(pickingId, reason) {
  return api('POST', '/pwa-pt/reject-transfer', { picking_id: pickingId, reason })
}

// ═════════════════════════════════════════════════════════════════════════════
//  LIVE — Routes & Load
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Rutas del día que necesitan carga.
 * @param {number} warehouseId
 * @returns {Promise<Array>}
 */
export async function getTodayRoutes(warehouseId) {
  return api('GET', `/pwa-entregas/today-routes?warehouse_id=${warehouseId}`)
}

/**
 * Sellar la carga: backend valida el load_picking (button_validate),
 * marca load_sealed/load_sealed_at/load_sealed_by_id y propaga el state.
 * Precondiciones backend: picking 'assigned', plan 'published'.
 * Backend: POST /gf/logistics/api/employee/route_plan/seal_load
 * @param {number} routePlanId
 * @returns {Promise<{ok:boolean, error?:string, plan_id?:number, state?:string,
 *   load_sealed?:boolean, load_sealed_at?:string, picking_state?:string}>}
 */
export async function confirmLoad(routePlanId) {
  return api('POST', '/pwa-entregas/confirm-load', { plan_id: routePlanId })
}

/**
 * Obtener líneas de detalle de carga de un picking.
 * @param {number|null} pickingId - stock.picking ID
 * @returns {Promise<Array>} Lines or empty array when no pickingId
 */
export async function getLoadDetail(pickingId) {
  if (!pickingId) return []
  return api('GET', `/pwa-ruta/load-lines?picking_id=${pickingId}`)
}

// ═════════════════════════════════════════════════════════════════════════════
//  LIVE — Tickets
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Buscar ticket por folio (ej: S00123).
 * @param {string} folio
 * @returns {Promise<Object>}
 */
export async function findTicket(folio) {
  return api('GET', `/pwa-admin/find-ticket?folio=${encodeURIComponent(folio)}`)
}

/**
 * Confirmar despacho de ticket — descuenta stock.
 * @param {number} orderId
 * @returns {Promise<Object>}
 */
export async function dispatchTicket(orderId) {
  return api('POST', '/pwa-admin/dispatch-ticket', { order_id: orderId })
}

/**
 * Tickets pendientes de despacho en este CEDIS.
 * @param {number} warehouseId
 * @returns {Promise<Array>}
 */
export async function getPendingTickets(warehouseId) {
  return api('GET', `/pwa-admin/pending-tickets?warehouse_id=${warehouseId}`)
}

// ═════════════════════════════════════════════════════════════════════════════
//  LIVE — Inventory
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Stock actual del CEDIS.
 * El BFF /pwa-pt/inventory cambió a forma canónica { warehouse_id, items: [...] }
 * (rebuild 2026-04-11). Este wrapper extrae items[] para que los consumers
 * (ScreenMerma, ScreenCierreTurno, ScreenOperacionDia) sigan recibiendo array.
 * Tolera shapes legacy (array directo) y respuestas envueltas en {data}.
 * @param {number} warehouseId
 * @returns {Promise<Array>}
 */
export async function getCedisInventory(warehouseId) {
  const result = await api('GET', `/pwa-pt/inventory?warehouse_id=${warehouseId}`)
  const items = Array.isArray(result?.items) ? result.items
    : Array.isArray(result?.data?.items) ? result.data.items
    : Array.isArray(result) ? result
    : Array.isArray(result?.data) ? result.data
    : []
  // Alias legacy: las pantallas (ScreenMerma, ScreenCierreTurno, ScreenOperacionDia)
  // referencian `item.product` y `item.weight`. El BFF v2 (2026-04-11) renombró a
  // `product_name` y `weight_per_unit`. Mapeo aquí (sin tocar shape canónica).
  return items.map((it) => ({
    ...it,
    product: it.product ?? it.product_name ?? '',
    weight: it.weight ?? it.weight_per_unit ?? 1,
  }))
}

// ═════════════════════════════════════════════════════════════════════════════
//  LIVE — Returns
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Devoluciones pendientes de ruta.
 * Now includes reception fields from Sebastián's extension:
 * received_by, received_at, received_qty, reception_state, reception_notes
 * @param {number} warehouseId
 * @returns {Promise<Array>}
 */
export async function getReturns(warehouseId) {
  return api('GET', `/pwa-entregas/returns?warehouse_id=${warehouseId}`)
}

/**
 * Aceptar devolución de ruta — confirma líneas recibidas.
 * Backend (gf_logistics_ops): sets received_by_id, received_at, received_qty,
 * reception_state. Creates internal stock.picking for received goods.
 * Prevents reprocessing (line already received → error).
 * Notes mandatory when received_qty differs from original qty.
 *
 * @param {number[]} stopLineIds  - IDs de líneas de parada a aceptar
 * @param {Object[]} lines - [{stop_line_id, received_qty, notes}]
 * @param {number} employeeId
 * @param {number} warehouseId
 * @returns {Promise<Object>} { success, lines_processed, picking_id, picking_name }
 */
export async function acceptReturn(stopLineIds, lines, employeeId, warehouseId) {
  return api('POST', '/pwa-entregas/return-accept', {
    stop_line_ids: stopLineIds,
    employee_id: employeeId,
    warehouse_id: warehouseId,
    lines,
  })
}

// ═════════════════════════════════════════════════════════════════════════════
//  LIVE — Scrap / Merma
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Catalogo dinamico de motivos de merma desde Odoo (gf.production.scrap.reason).
 * Backend: POST /gf/logistics/api/employee/warehouse_scrap/reasons
 * @returns {Promise<Array<{id:number, name:string}>>}
 */
export async function getScrapReasons() {
  try {
    const result = await api('GET', '/pwa-entregas/scrap-reasons')
    // Backend Sebastian shape confirmado: { ok, data: { reasons: [{id, name}, ...] } }
    // Mantenemos fallbacks defensivos por si cambia.
    const items = result?.data?.reasons
      || result?.reasons
      || (Array.isArray(result?.data) ? result.data : null)
      || (Array.isArray(result) ? result : null)
      || []
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

/**
 * Registrar merma en almacén.
 * Backend (gf_logistics_ops): creates stock.scrap, validates available stock,
 * validates scrap location exists, validates immediately (action_validate).
 * Origin format: PWA-ENTREGAS/{employee}/{date}
 *
 * @param {number} warehouseId
 * @param {number} employeeId
 * @param {number} productId
 * @param {number} qty
 * @param {number} reasonId - id de gf.production.scrap.reason
 * @param {string} [notes]
 * @returns {Promise<Object>} { success, scrap_id, scrap_name, product, qty, state }
 */
export async function createScrap(warehouseId, employeeId, productId, qty, reasonId, notes) {
  return api('POST', '/pwa-entregas/scrap-create', {
    warehouse_id: warehouseId,
    employee_id: employeeId,
    product_id: productId,
    scrap_qty: qty,
    reason_id: reasonId,
    notes: notes || '',
  })
}

/**
 * Historial de mermas del día para este CEDIS.
 * Reads stock.scrap records created today for this warehouse.
 *
 * @param {number} warehouseId
 * @returns {Promise<Array>}
 */
export async function getScrapHistory(warehouseId) {
  try {
    const result = await api('GET', `/pwa-entregas/scrap-history?warehouse_id=${warehouseId}`)
    // Backend: {ok, data: [{id, product_name, scrap_qty, reason_tag, notes, create_date, ...}]}
    const items = result?.data || result || []
    if (!Array.isArray(items)) return []
    return items.map(s => ({
      id: s.id,
      product: s.product_name || s.product_id?.[1] || 'Producto',
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

// ═════════════════════════════════════════════════════════════════════════════
//  LIVE — Shift Handover / Entrega de Turno
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Crear entrega de turno (turno saliente registra estado del almacén).
 * Backend (gf_logistics_ops): creates gf.shift.handover with stock snapshot,
 * validates no duplicate (warehouse+date+employee), state → submitted.
 *
 * @param {number} warehouseId
 * @param {number} employeeId
 * @param {Object[]} lines - [{product_id, qty_declared, note?}]
 * @param {string} [notes]
 * @returns {Promise<Object>} { success, handover_id, total_products, has_differences }
 */
export async function createShiftHandover(warehouseId, employeeId, lines, notes) {
  return api('POST', '/pwa-entregas/shift-handover-create', {
    warehouse_id: warehouseId,
    employee_id: employeeId,
    lines,
    notes: notes || '',
  })
}

/**
 * Consultar si hay un handover pendiente de aceptar para este CEDIS.
 * Backend (gf_logistics_ops): searches gf.shift.handover with
 * state=submitted for today + warehouse.
 *
 * @param {number} warehouseId
 * @returns {Promise<Object|null>} Handover object or null
 */
export async function getPendingHandover(warehouseId) {
  try {
    const result = await api('GET', `/pwa-entregas/shift-handover-pending?warehouse_id=${warehouseId}`)
    // Backend returns { handover: {...} } or { handover: null }
    if (result?.handover) return result.handover
    if (result && result.id) return result // direct handover object
    return null
  } catch {
    return null
  }
}

/**
 * Aceptar / disputar entrega de turno (turno entrante).
 * Backend (gf_logistics_ops): updates lines with qty_accepted, computes diffs,
 * auto-escalates to 'disputed' if diff > 10%, creates activity for supervisor.
 * Notes mandatory for lines with diff > 5%.
 *
 * @param {number} handoverId
 * @param {number} employeeId
 * @param {Object[]} lines - [{line_id, qty_accepted, notes?}]
 * @param {string} [notes]
 * @param {'accept'|'reject'} action
 * @returns {Promise<Object>} { success, state, has_differences, total_differences }
 */
export async function acceptShiftHandover(handoverId, employeeId, lines, notes, action) {
  return api('POST', '/pwa-entregas/shift-handover-accept', {
    handover_id: handoverId,
    employee_id: employeeId,
    lines,
    notes: notes || '',
    action: action || 'accept',
  })
}

// ═════════════════════════════════════════════════════════════════════════════
//  HELPER — Compute step statuses from summary data
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Derive the status of each workflow step from a day-summary object.
 * Used by the stepper UI to show locked / pending / completed / alert states.
 *
 * @param {Object} summary - Object returned by getDaySummary()
 * @returns {Object} Map of step key -> STEP_STATUS value
 */
export function computeStepStatuses(summary) {
  return {
    aceptarTurno: summary.shift_handover_pending
      ? STEP_STATUS.PENDING
      : summary.shift_accepted_today
        ? STEP_STATUS.COMPLETED
        : STEP_STATUS.LOCKED,

    recibirPT: summary.pending_pallets > 0
      ? STEP_STATUS.PENDING
      : STEP_STATUS.COMPLETED,

    cargarUnidades: summary.routes_pending > 0
      ? STEP_STATUS.PENDING
      : summary.routes_total > 0
        ? STEP_STATUS.COMPLETED
        : STEP_STATUS.LOCKED,

    operacionDia: STEP_STATUS.IN_PROGRESS, // always available during the day

    devoluciones: summary.pending_returns > 0
      ? STEP_STATUS.ALERT
      : STEP_STATUS.COMPLETED,

    merma: STEP_STATUS.IN_PROGRESS, // always available

    entregarTurno: STEP_STATUS.PENDING, // always pending until done
  }
}
