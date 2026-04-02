// ─── API Supervisor de Ventas ────────────────────────────────────────────────

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

// ── Dashboard / Equipo ───────────────────────────────────────────────────────

/** Lista de vendedores del equipo con estado de ruta */
export function getTeam() {
  return api('GET', '/pwa-supv/team')
}

/** Rutas del día de todo el equipo */
export function getTeamRoutes() {
  return api('GET', '/pwa-supv/team-routes')
}

// ── Pronóstico ───────────────────────────────────────────────────────────────

/** Productos disponibles para forecast */
export function getForecastProducts() {
  return api('GET', '/pwa-supv/forecast-products')
}

/** Crear forecast para mañana */
export function createForecast(data) {
  return api('POST', '/pwa-supv/forecast-create', data)
}

/** Forecasts recientes */
export function getForecasts() {
  return api('GET', '/pwa-supv/forecasts')
}

// ── Metas mensuales ──────────────────────────────────────────────────────────

/** Metas de todos los vendedores del equipo */
export function getTeamTargets() {
  return api('GET', '/pwa-supv/team-targets')
}

// ── KPI Snapshots ────────────────────────────────────────────────────────────

/** KPIs diarios de la sucursal */
export function getKpiSnapshots(sucursalId) {
  return api('GET', `/pwa-supv/kpi-snapshots?sucursal_id=${sucursalId}`)
}
