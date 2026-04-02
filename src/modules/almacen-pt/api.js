// ─── API Almacén PT — Llamadas a n8n webhooks ──────────────────────────────

const N8N_BASE = '/api-n8n'

function getToken() {
  try {
    const s = JSON.parse(localStorage.getItem('gf_session') || '{}')
    return s.session_token || ''
  } catch { return '' }
}

async function api(method, path, body) {
  const token = getToken()
  if (!token) throw new Error('no_session')
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${N8N_BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `http_${res.status}`)
  }
  const json = await res.json()
  return json.data !== undefined ? json.data : json
}

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
