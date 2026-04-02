// ─── API Gerente de Sucursal ─────────────────────────────────────────────────

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

/** Alertas del día (gf.ops.event_log filtrado por sucursal) */
export function getAlerts() {
  return api('GET', '/pwa-gerente/alerts')
}

/** Forecasts confirmados (bloqueados, listos para unlock) */
export function getLockedForecasts() {
  return api('GET', '/pwa-gerente/forecasts-locked')
}

/** Desbloquear forecast (set state=draft) */
export function unlockForecast(forecastId) {
  return api('POST', '/pwa-gerente/forecast-unlock', { forecast_id: forecastId })
}

/** KPI summary de la sucursal */
export function getKpiSummary() {
  return api('GET', '/pwa-gerente/kpi-summary')
}
