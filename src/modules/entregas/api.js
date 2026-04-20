// ─── API Almacenista Entregas ─────────────────────────────────────────────────
import { api } from '../../lib/api'

// ── Validación de tickets ────────────────────────────────────────────────────

/** Buscar ticket por folio (ej: S00123) */
export function findTicket(folio) {
  return api('GET', `/pwa-admin/find-ticket?folio=${encodeURIComponent(folio)}`)
}

/** Confirmar despacho → descuenta stock */
export function dispatchTicket(orderId) {
  return api('POST', '/pwa-admin/dispatch-ticket', { order_id: orderId })
}

/** Tickets pendientes de despacho en este CEDIS */
export function getPendingTickets(warehouseId) {
  return api('GET', `/pwa-admin/pending-tickets?warehouse_id=${warehouseId}`)
}

// ── Inventario CEDIS ─────────────────────────────────────────────────────────

/** Stock actual del CEDIS */
export function getCedisInventory(warehouseId) {
  return api('GET', `/pwa-pt/inventory?warehouse_id=${warehouseId}`)
}

// ── Preparar carga para rutas ────────────────────────────────────────────────

/** Rutas del día que necesitan carga */
export function getTodayRoutes(warehouseId) {
  return api('GET', `/pwa-entregas/today-routes?warehouse_id=${warehouseId}`)
}

/** Confirmar carga despachada a ruta */
export function confirmLoad(routePlanId) {
  return api('POST', '/pwa-entregas/confirm-load', { route_plan_id: routePlanId })
}

/** Recibir devoluciones de ruta */
export function getReturns(warehouseId) {
  return api('GET', `/pwa-entregas/returns?warehouse_id=${warehouseId}`)
}

// ── Transferencias PT → CEDIS (stock.picking transactional) ────────────────
// Sebastian rollout 2026-04-19. Reemplaza el legacy gf.pallet.

/** Transferencias pendientes hacia este CEDIS */
export function getPendingTransfers(warehouseId) {
  return api('GET', `/pwa-pt/pending-transfers?warehouse_id=${warehouseId}`)
}

/** Aceptar transferencia (ejecuta picking.button_validate en Odoo) */
export function acceptTransfer(pickingId) {
  return api('POST', '/pwa-pt/accept-transfer', { picking_id: pickingId })
}

/** Rechazar transferencia con motivo obligatorio */
export function rejectTransfer(pickingId, reason) {
  return api('POST', '/pwa-pt/reject-transfer', { picking_id: pickingId, reason })
}

// ── Detalle de carga ────────────────────────────────────────────────────────

/** Líneas de carga de un picking específico */
export function getLoadLines(pickingId) {
  return api('GET', `/pwa-ruta/load-lines?picking_id=${pickingId}`)
}
