// ─── API Supervisión Producción — Llamadas a n8n ────────────────────────────

const N8N_BASE = '/api-n8n'

function getToken() {
  try { return JSON.parse(localStorage.getItem('gf_session') || '{}').session_token || '' }
  catch { return '' }
}

async function api(method, path, body) {
  const token = getToken()
  if (!token) throw new Error('no_session')
  const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${N8N_BASE}${path}`, opts)
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || `http_${res.status}`) }
  const json = await res.json()
  return json.data !== undefined ? json.data : json
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export function getShiftDashboard() { return api('GET', '/pwa-sup/dashboard') }
export function getShiftOperators(shiftId) { return api('GET', `/pwa-sup/operators?shift_id=${shiftId}`) }

// ── Turnos ───────────────────────────────────────────────────────────────────
export function getActiveShift() { return api('GET', '/pwa-sup/active-shift') }
export function createShift(data) { return api('POST', '/pwa-sup/shift-create', data) }
export function closeShift(shiftId) { return api('POST', '/pwa-sup/shift-close', { shift_id: shiftId }) }

// ── Paros ────────────────────────────────────────────────────────────────────
export function getDowntimes(shiftId) { return api('GET', `/pwa-sup/downtimes?shift_id=${shiftId}`) }
export function getDowntimeCategories() { return api('GET', '/pwa-sup/downtime-categories') }
export function createDowntime(data) { return api('POST', '/pwa-sup/downtime-create', data) }
export function closeDowntime(downtimeId) { return api('POST', '/pwa-sup/downtime-close', { downtime_id: downtimeId }) }

// ── Merma ────────────────────────────────────────────────────────────────────
export function getScraps(shiftId) { return api('GET', `/pwa-sup/scraps?shift_id=${shiftId}`) }
export function getScrapReasons() { return api('GET', '/pwa-sup/scrap-reasons') }
export function createScrap(data) { return api('POST', '/pwa-sup/scrap-create', data) }

// ── Energía ──────────────────────────────────────────────────────────────────
export function getEnergyReadings(shiftId) { return api('GET', `/pwa-sup/energy?shift_id=${shiftId}`) }
export function createEnergyReading(data) { return api('POST', '/pwa-sup/energy-create', data) }

// ── Mantenimiento ────────────────────────────────────────────────────────────
export function getMaintenanceRequests() { return api('GET', '/pwa-sup/maintenance') }
export function createMaintenanceRequest(data) { return api('POST', '/pwa-sup/maintenance-create', data) }
