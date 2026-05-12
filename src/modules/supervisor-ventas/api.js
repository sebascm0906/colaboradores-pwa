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
export function ensureDailyRoutePlan(routeId, dateTarget, criteria = {}) {
  return api('POST', '/pwa-supv/route-plan-ensure', {
    route_id: Number(routeId || 0),
    date_target: dateTarget,
    ...criteria,
  })
}

/** Poligonos disponibles para planeacion diaria */
export function getPlanningPolygons() {
  return api('GET', '/pwa-supv/polygons')
}

/** Subpoligonos de un poligono padre */
export function getPlanningSubpolygons(polygonId) {
  const qs = polygonId ? `?polygon_id=${encodeURIComponent(polygonId)}` : ''
  return api('GET', `/pwa-supv/subpolygons${qs}`)
}

/** Canales comerciales disponibles para filtrar clientes */
export function getPlanningChannels() {
  return api('GET', '/pwa-supv/customer-channels')
}

/** Ventanas horarias disponibles para filtrar clientes */
export function getPlanningTimeWindows() {
  return api('GET', '/pwa-supv/time-windows')
}

/** Planes diarios activos/editables para agregar clientes manualmente */
export function getActiveRoutePlans(dateTarget) {
  const qs = dateTarget ? `?date_target=${encodeURIComponent(dateTarget)}` : ''
  return api('GET', `/pwa-supv/active-route-plans${qs}`)
}

/** Buscar clientes para agregarlos manualmente a un plan */
export function searchPlanningCustomers(query) {
  const qs = query ? `?q=${encodeURIComponent(query)}` : ''
  return api('GET', `/pwa-supv/customers/search${qs}`)
}

/** Agregar un cliente como parada manual a un plan activo */
export function addCustomerToRoutePlan(routePlanId, customerId, notes = '') {
  return api('POST', '/pwa-supv/route-plan-add-customer', {
    route_plan_id: Number(routePlanId || 0),
    customer_id: Number(customerId || 0),
    notes: String(notes || '').trim(),
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

// ── F4-E.2: Route suggestions from weekly plan master ───────────────────────
// Backend endpoints (gf_route_compliance/controllers/pwa_route_suggestions.py):
//   GET  /pwa-supv/branch-configs
//   GET  /pwa-supv/route-suggestions
//   POST /pwa-supv/route-suggestions/confirm
//
// Permite a la supervisora ver las sugerencias del Plan Maestro Semanal
// (gf.route.weekly.plan.line) para una fecha y confirmar recursos
// (driver/vehicle/etc.) SIN generar gf.route.plan ni invocar F4-D.
// El flujo manual existente (ensureDailyRoutePlan) queda intacto y coexiste
// con esta opcion como toggle en ScreenPronostico.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * F4-E.2: lista branch_configs activos accesibles para la PWA.
 * Permite resolver branch_config_id sin hardcodearlo en el frontend.
 *
 * @returns {Promise<{ok: boolean, data: {branch_configs: Array, count: number}}>}
 */
export function getBranchConfigs() {
  return api('GET', '/pwa-supv/branch-configs')
}

/**
 * F4-E.2: lee sugerencias del weekly plan para una fecha + branch.
 *
 * Reglas backend:
 *   - Si se pasa weekly_plan_id, ese tiene prioridad.
 *   - Si no, se busca por (branch_config_id, date) en estados draft|published|in_progress.
 *   - Estados cancelled/closed bloqueados.
 *   - Si la fecha cae fuera del rango del plan, devuelve suggestions=[] + message warning.
 *
 * @param {Object} opts
 * @param {string} [opts.date]              YYYY-MM-DD (default backend: tomorrow)
 * @param {number} [opts.weeklyPlanId]      ID del weekly plan (prioritario)
 * @param {number} [opts.branchConfigId]    Requerido si no se pasa weeklyPlanId
 * @returns {Promise<Object>}
 */
export function getRouteSuggestions({ date, weeklyPlanId, branchConfigId } = {}) {
  const qs = new URLSearchParams()
  if (date) qs.set('date', date)
  if (weeklyPlanId) qs.set('weekly_plan_id', String(weeklyPlanId))
  if (branchConfigId) qs.set('branch_config_id', String(branchConfigId))
  const query = qs.toString()
  return api('GET', `/pwa-supv/route-suggestions${query ? `?${query}` : ''}`)
}

/**
 * F4-E.2: confirma recursos sobre una linea del weekly plan.
 *
 * El backend (gf_route_compliance) escribe SOLO en gf.route.weekly.plan.line
 * con whitelist estricto. NO crea gf.route.plan ni gf.route.stop.
 * Driver+vehicle deben resolver a 1 gf.route activa.
 *
 * Campos permitidos (extras devuelven invalid_payload):
 *   - weekly_plan_line_id (REQUIRED)
 *   - planned_driver_id (REQUIRED)
 *   - planned_vehicle_id (REQUIRED)
 *   - planned_salesperson_id (opcional)
 *   - planned_mobile_location_id (opcional)
 *   - planned_warehouse_dispatch_id (opcional)
 *   - planned_departure_time (opcional, float horas)
 *
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export function confirmRouteSuggestion(payload) {
  return api('POST', '/pwa-supv/route-suggestions/confirm', payload || {})
}
