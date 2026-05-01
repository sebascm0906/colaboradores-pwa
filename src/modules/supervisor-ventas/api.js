// ─── API Supervisor de Ventas ────────────────────────────────────────────────
// Capa de endpoints para el módulo Supervisor de Ventas V2.
//
// ESTADO ACTUAL (2026-04-09):
// Todos los endpoints se resuelven via directSupervisorVentas() en lib/api.js
// como queries JSON-RPC directas a Odoo (readModelSorted / createUpdate).
//
// CUANDO SEBASTIÁN SUBA gf_saleops/controllers/supervisor.py:
// Estas funciones NO necesitan cambiar — api() rutea automáticamente.
// Los controllers deben exponer las mismas rutas /pwa-supv/*.
//
// SCOPE:
// - company_id se extrae de la sesión automáticamente en lib/api.js
// - employee_id se pasa explícitamente donde aplica (forecast, kpi)
// ─────────────────────────────────────────────────────────────────────────────

import { api } from '../../lib/api.js'

// ── Dashboard / Equipo ───────────────────────────────────────────────────────

/** Lista de vendedores del equipo (filtra por company_id de sesión) */
export function getTeam() {
  return api('GET', '/pwa-supv/team')
}

/** Rutas del equipo para una fecha (default: hoy) */
export function getTeamRoutes(date) {
  const qs = date ? `?date=${date}` : ''
  return api('GET', `/pwa-supv/team-routes${qs}`)
}

// ── Pronóstico ───────────────────────────────────────────────────────────────

/** Productos disponibles para forecast */
export function getForecastProducts() {
  return api('GET', '/pwa-supv/forecast-products')
}

/**
 * Crear forecast.
 * @param {Object} data
 * @param {string} data.date_target - YYYY-MM-DD
 * @param {Array} data.lines - [{product_id, channel, qty}]
 * @param {number} [data.sucursal] - analytic_account_id (sucursal)
 * @param {number} [data.route_id] - Ruta maestra gf.route para forecast por ruta.
 * @param {number} [data.route_plan_id] - Plan diario gf.route.plan asociado.
 * @param {number} [data.employee_id] - Si se especifica, forecast es per-vendor.
 *   Si se omite, es forecast global de sucursal.
 *   NOTA: Requiere que gf.saleops.forecast tenga campo employee_id
 *   (propuesto en spec § 3.1, pendiente de confirmación con Sebastián)
 */
export function createForecast(data) {
  return api('POST', '/pwa-supv/forecast-create', data)
}

/** Rutas maestras asignadas al CEDIS de la sesión para planeación diaria */
export function getRouteTemplatesForPlanning(dateTarget) {
  const qs = dateTarget ? `?date_target=${encodeURIComponent(dateTarget)}` : ''
  return api('GET', `/pwa-supv/route-templates${qs}`)
}

/** Crear o reutilizar el plan diario de una ruta para la fecha objetivo */
export function ensureDailyRoutePlan(routeId, dateTarget) {
  return api('POST', '/pwa-supv/route-plan-ensure', {
    route_id: Number(routeId || 0),
    date_target: dateTarget,
  })
}

/**
 * Forecasts recientes.
 * @param {Object} [opts]
 * @param {number} [opts.employee_id] - Filtrar por vendedor específico.
 */
export function getForecasts(opts) {
  const qs = opts?.employee_id ? `?employee_id=${opts.employee_id}` : ''
  return api('GET', `/pwa-supv/forecasts${qs}`)
}

/** Confirmar un forecast (draft → confirmed) */
export function confirmForecast(forecastId) {
  return api('POST', '/pwa-supv/forecast-confirm', { forecast_id: forecastId })
}

/** Cancelar/reset un forecast (confirmed → draft) */
export function cancelForecast(forecastId) {
  return api('POST', '/pwa-supv/forecast-cancel', { forecast_id: forecastId })
}

/** Eliminar un forecast en borrador (solo draft) */
export function deleteForecast(forecastId) {
  return api('POST', '/pwa-supv/forecast-delete', { forecast_id: forecastId })
}

/** Líneas de un forecast (productos, canal, qty) */
export function getForecastLines(forecastId) {
  return api('GET', `/pwa-supv/forecast-lines?forecast_id=${forecastId}`)
}

/** Reemplazar las líneas de un forecast borrador */
export function updateForecastLines(forecastId, lines) {
  return api('POST', '/pwa-supv/forecast-update-lines', { forecast_id: forecastId, lines })
}

// ── Metas mensuales ──────────────────────────────────────────────────────────

/** Metas de todos los vendedores del equipo (mes actual) */
export function getTeamTargets() {
  return api('GET', '/pwa-supv/team-targets')
}

// ── KPI Snapshots ────────────────────────────────────────────────────────────

/**
 * KPIs diarios de la sucursal.
 * @param {number} sucursalId - analytic_account_id
 * NOTA: Hoy filtra por sucursal (branch-level). Cuando el controller
 * de Sebastián tenga scope_key + employee_id, se podrá filtrar
 * por vendedor individual.
 */
export function getKpiSnapshots(sucursalId) {
  return api('GET', `/pwa-supv/kpi-snapshots?sucursal_id=${sucursalId}`)
}

// ── Detalle de Ruta ─────────────────────────────────────────────────────────

/** Paradas de una ruta (detalle de visitas) */
export function getRouteStops(routePlanId) {
  return api('GET', `/pwa-supv/route-stops?route_plan_id=${routePlanId}`)
}

// ── Score Semanal ───────────────────────────────────────────────────────────

/** Rutas de la semana (lunes a domingo) para score grid */
export function getWeekRoutes() {
  return api('GET', '/pwa-supv/week-routes')
}

// ── Ventas del día por vendedor (Sebastián audit 2026-04-10) ────────────────
// Backend: GET /api/pt/day-sales → sales_qty_by_employee_for_day()
// El endpoint vive en gf_saleops/controllers/pt.py pero es consumido aquí por
// supervisor-ventas para mostrar ventas del día por cada vendedor del equipo.
// Response shape: { ok, data: { date, warehouse_id, items: [{ employee_id, employee_name, qty_total, kg_total, products? }] } }

/**
 * @param {Object} [opts]
 * @param {number} [opts.warehouseId] - Warehouse PT origen (default sesión).
 * @param {string} [opts.date]        - YYYY-MM-DD (default: hoy).
 * @returns {Promise<{ date: string, warehouse_id: number, items: Array }>}
 */
export async function getDaySales(opts = {}) {
  const qs = new URLSearchParams()
  if (opts.warehouseId) qs.set('warehouse_id', String(opts.warehouseId))
  if (opts.date) qs.set('date', opts.date)
  const result = await api('GET', `/pwa-pt/day-sales${qs.toString() ? `?${qs}` : ''}`)
  const payload = result?.data || result || {}
  return {
    date: payload.date || opts.date || new Date().toISOString().slice(0, 10),
    warehouse_id: payload.warehouse_id || opts.warehouseId || 0,
    items: Array.isArray(payload.items) ? payload.items
         : Array.isArray(payload) ? payload
         : [],
  }
}
