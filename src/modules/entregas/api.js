// ─── API Almacenista Entregas ─────────────────────────────────────────────────

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
