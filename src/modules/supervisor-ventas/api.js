// ─── API Supervisor de Ventas ────────────────────────────────────────────────
import { api } from '../../lib/api'

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
