// ─── API Gerente de Sucursal ─────────────────────────────────────────────────
import { api } from '../../lib/api'

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
