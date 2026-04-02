// ─── API Almacén PT — Llamadas a n8n webhooks ──────────────────────────────
import { api } from '../../lib/api'

// ── Recepción de producción ──────────────────────────────────────────────────

/** Tarimas pendientes de recibir (status=available, sin received_by) */
export function getPendingPallets(warehouseId) {
  return api('GET', `/pwa-pt/pending-pallets?warehouse_id=${warehouseId}`)
}

/** Aceptar tarima */
export function acceptPallet(palletId) {
  return api('POST', '/pwa-pt/accept-pallet', { pallet_id: palletId })
}

/** Rechazar tarima (hold) */
export function rejectPallet(palletId, reason) {
  return api('POST', '/pwa-pt/reject-pallet', { pallet_id: palletId, reason })
}

// ── Inventario ───────────────────────────────────────────────────────────────

/** Inventario actual del almacén de PT */
export function getInventory(warehouseId) {
  return api('GET', `/pwa-pt/inventory?warehouse_id=${warehouseId}`)
}

/** Tarimas aceptadas listas para despacho */
export function getReadyPallets(warehouseId) {
  return api('GET', `/pwa-pt/ready-pallets?warehouse_id=${warehouseId}`)
}

// ── Despacho a CEDIS ─────────────────────────────────────────────────────────

/** Lista de CEDIS disponibles para despacho */
export function getCedisList() {
  return api('GET', '/pwa-pt/cedis-list')
}

/** Crear traspaso a CEDIS */
export function createDispatch(data) {
  return api('POST', '/pwa-pt/dispatch-create', data)
}

// ── Historial ────────────────────────────────────────────────────────────────

/** Historial de traspasos recientes */
export function getDispatchHistory(warehouseId) {
  return api('GET', `/pwa-pt/dispatch-history?warehouse_id=${warehouseId}`)
}
