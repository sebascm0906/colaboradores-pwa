// ─── API Admin Sucursal — POS, Gastos, Requisiciones ─────────────────────────

const N8N_BASE = '/api-n8n'

function getToken() {
  try { return JSON.parse(localStorage.getItem('gf_session') || '{}').session_token || '' }
  catch { return '' }
}

async function api(method, path, body) {
  const token = getToken()
  if (!token) { window.dispatchEvent(new Event('gf:session-expired')); throw new Error('no_session') }
  const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${N8N_BASE}${path}`, opts)
  if (!res.ok) { if (res.status === 401) { window.dispatchEvent(new Event('gf:session-expired')); throw new Error('no_session') } const err = await res.json().catch(() => ({})); throw new Error(err.message || `http_${res.status}`) }
  const json = await res.json()
  return json.data !== undefined ? json.data : json
}

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
