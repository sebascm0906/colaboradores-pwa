// ─── API Admin Sucursal — POS, Gastos, Requisiciones ─────────────────────────
import { api } from '../../lib/api'

// ── POS Mostrador ────────────────────────────────────────────────────────────

/** Productos disponibles con stock en el CEDIS del empleado */
export function getPosProducts(warehouseId) {
  return api('GET', `/pwa-admin/pos-products?warehouse_id=${warehouseId}`)
}

/** Buscar clientes (para factura) */
export function searchCustomers(query) {
  return api('GET', `/pwa-admin/customers?q=${encodeURIComponent(query)}`)
}

/** Cliente default "Publico Mostrador" de la sucursal */
export function getDefaultCustomer() {
  return api('GET', '/pwa-admin/default-customer')
}

/** Crear venta (sale.order + confirmar) */
export function createSaleOrder(data) {
  return api('POST', '/pwa-admin/sale-create', data)
}

/** Ver detalle de un ticket/venta */
export function getSaleOrder(orderId) {
  return api('GET', `/pwa-admin/sale-detail?order_id=${orderId}`)
}

/** Ventas del día */
export function getTodaySales(warehouseId) {
  return api('GET', `/pwa-admin/today-sales?warehouse_id=${warehouseId}`)
}

// ── Validación de ticket (Almacenista Entregas) ──────────────────────────────

/** Buscar ticket por folio */
export function findTicket(folio) {
  return api('GET', `/pwa-admin/find-ticket?folio=${encodeURIComponent(folio)}`)
}

/** Confirmar despacho de ticket → descuenta inventario */
export function dispatchTicket(orderId) {
  return api('POST', '/pwa-admin/dispatch-ticket', { order_id: orderId })
}

/** Tickets pendientes de despacho */
export function getPendingTickets(warehouseId) {
  return api('GET', `/pwa-admin/pending-tickets?warehouse_id=${warehouseId}`)
}

// ── Gastos ────────────────────────────────────────────────────────────────────

/** Registrar gasto */
export function createExpense(data) {
  return api('POST', '/pwa-admin/expense-create', data)
}

/** Gastos del día */
export function getTodayExpenses() {
  return api('GET', '/pwa-admin/today-expenses')
}

/** Historial de gastos con filtros */
export function getExpensesHistory(filters = {}) {
  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  const qs = query.toString()
  return api('GET', `/pwa-admin/expenses-history${qs ? `?${qs}` : ''}`)
}

// ── Requisiciones ────────────────────────────────────────────────────────────

/** Crear requisición de compra */
export function createRequisition(data) {
  return api('POST', '/pwa-admin/requisition-create', data)
}

/** Requisiciones recientes */
export function getRequisitions() {
  return api('GET', '/pwa-admin/requisitions')
}

// ── Cierre de Caja ───────────────────────────────────────────────────────────

/** Resumen del día (ventas, gastos, cobros) */
export function getCashClosing(warehouseId) {
  return api('GET', `/pwa-admin/cash-closing?warehouse_id=${warehouseId}`)
}
