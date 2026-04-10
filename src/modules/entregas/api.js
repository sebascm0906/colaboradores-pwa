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

// ── Pallets desde Producto Terminado ────────────────────────────────────────

/** Tarimas pendientes de aceptar en este CEDIS */
export function getPendingPallets(warehouseId) {
  return api('GET', `/pwa-pt/pending-pallets?warehouse_id=${warehouseId}`)
}

/** Aceptar tarima recibida */
export function acceptPallet(palletId) {
  return api('POST', '/pwa-pt/accept-pallet', { pallet_id: palletId })
}

/** Rechazar tarima con motivo */
export function rejectPallet(palletId, reason) {
  return api('POST', '/pwa-pt/reject-pallet', { pallet_id: palletId, reason })
}

/** Tarimas listas (ya aceptadas) en CEDIS */
export function getReadyPallets(warehouseId) {
  return api('GET', `/pwa-pt/ready-pallets?warehouse_id=${warehouseId}`)
}

// ── Detalle de carga ────────────────────────────────────────────────────────

/** Líneas de carga de un picking específico */
export function getLoadLines(pickingId) {
  return api('GET', `/pwa-ruta/load-lines?picking_id=${pickingId}`)
}
