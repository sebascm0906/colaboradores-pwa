// supvService.js — V2 Supervisor Ventas Service Layer
// ═══════════════════════════════════════════════════════════════════════════════
// Aggregates data from multiple Odoo endpoints for V2 screens.
//
// TRAZABILIDAD DE DATOS (2026-04-09):
// ┌────────────────────┬──────────────────────────────┬──────────────┐
// │ Dato               │ Fuente                       │ Scope        │
// ├────────────────────┼──────────────────────────────┼──────────────┤
// │ Team list          │ hr.employee                  │ company_id   │
// │ Routes/Stops       │ gf.route.plan, gf.route.stop │ company_id   │
// │ Metas mensuales    │ hr.employee.monthly.target   │ company_id   │
// │ Forecast           │ gf.saleops.forecast          │ company_id   │
// │ KPI snapshots      │ gf.saleops.kpi.snapshot      │ company_id + │
// │                    │                              │ sucursal_id  │
// │ Ventas por vendedor│ NO EXISTE ENDPOINT HOY       │ —            │
// │ Forecast x vendor  │ PARCIAL (created_by, no      │ company_id   │
// │                    │ employee_id filtrable)        │              │
// └────────────────────┴──────────────────────────────┴──────────────┘
//
// NOTA: sales_actual en hr.employee.monthly.target es MENSUAL acumulado,
// no ventas del DÍA. El supervisor ve cumplimiento mensual, no diario.
// Cuando Sebastián implemente GET /pwa-supv/day-sales (spec § 4.1),
// se podrá mostrar venta diaria real.
// ═══════════════════════════════════════════════════════════════════════════════

import { api } from '../../lib/api'

// Re-export all existing + new API functions for convenience
export {
  getTeam,
  getTeamRoutes,
  getForecastProducts,
  createForecast,
  getForecasts,
  getTeamTargets,
  getKpiSnapshots,
  getRouteStops,
  getWeekRoutes,
} from './api'

// ── Helpers (date formatting) ─────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0')

function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getYesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return fmtDate(d)
}

function getTodayStr() {
  return fmtDate(new Date())
}

// ── LIVE: Day Overview (aggregated from existing endpoints) ─────────────────

/**
 * Builds a full day overview for the supervisor dashboard.
 * Accepts optional date param (YYYY-MM-DD). Defaults to today.
 * Fetches team, routes, and targets in parallel, then aggregates.
 * Vendors are sorted by compliance ascending (worst first).
 *
 * @param {string} [date] - Date string YYYY-MM-DD
 * @returns {Promise<Object>}
 */
export async function getDayOverview(date) {
  const dateStr = date || getTodayStr()
  const isToday = dateStr === getTodayStr()

  const [teamRes, routesRes, targetsRes] = await Promise.allSettled([
    api('GET', '/pwa-supv/team'),
    api('GET', `/pwa-supv/team-routes?date=${dateStr}`),
    api('GET', '/pwa-supv/team-targets'),
  ])

  const team = teamRes.status === 'fulfilled' ? (Array.isArray(teamRes.value) ? teamRes.value : []) : []
  const routes = routesRes.status === 'fulfilled' ? (Array.isArray(routesRes.value) ? routesRes.value : []) : []
  const targets = targetsRes.status === 'fulfilled' ? (Array.isArray(targetsRes.value) ? targetsRes.value : []) : []

  // Map routes to drivers/salespersons
  const routeByDriver = {}
  routes.forEach((r) => {
    const key = r.driver_id || r.salesperson_id
    if (key) routeByDriver[key] = r
  })

  // Build vendor summary
  const vendors = team
    .map((emp) => {
      const route = routeByDriver[emp.id]
      const target = targets.find((t) => {
        const tid = Array.isArray(t.employee_id) ? t.employee_id[0] : t.employee_id
        return tid === emp.id
      })

      const stopsTotal = route?.stops_total || 0
      const stopsDone = route?.stops_done || 0
      const compliance = stopsTotal > 0 ? Math.round((stopsDone / stopsTotal) * 100) : 0

      return {
        id: emp.id,
        name: emp.name,
        phone: emp.phone || '',
        image: emp.image_128 || null,
        route_id: route?.id || null,
        route_name: route?.name || '',
        state: route?.state || 'no_route',
        stops_total: stopsTotal,
        stops_done: stopsDone,
        compliance,
        progress: route?.progress || 0,
        effectiveness: route?.effectiveness || 0,
        sales_target: target?.sales_target || 0,
        sales_actual: target?.sales_actual || 0,
        has_route: !!route,
        status: !route ? 'no_route' : compliance >= 80 ? 'good' : compliance >= 50 ? 'warning' : 'critical',
        // Departure tracking
        departure_target: route?.departure_target || null,
        departure_real: route?.departure_real || null,
        departure_on_time: route?.departure_on_time || false,
        has_departed: !!route?.departure_real,
        load_sealed: route?.load_sealed || false,
        // Liquidation / closure
        closure_time: route?.closure_time || null,
        reconciliation_id: route?.reconciliation_id || null,
        reconciliation_name: route?.reconciliation_name || '',
        force_close_reason: route?.force_close_reason || null,
        is_closed: !!route?.closure_time,
        is_liquidated: !!route?.reconciliation_id,
      }
    })
    .sort((a, b) => a.compliance - b.compliance) // worst first

  // Aggregates
  const totalStops = vendors.reduce((s, v) => s + v.stops_total, 0)
  const doneStops = vendors.reduce((s, v) => s + v.stops_done, 0)
  const avgCompliance = totalStops > 0 ? Math.round((doneStops / totalStops) * 100) : 0
  const totalSalesTarget = targets.reduce((s, t) => s + (t.sales_target || 0), 0)
  const totalSalesActual = targets.reduce((s, t) => s + (t.sales_actual || 0), 0)

  // Departure aggregates
  const vendorsWithRoute = vendors.filter((v) => v.has_route)
  const departed = vendorsWithRoute.filter((v) => v.has_departed).length
  const notDeparted = vendorsWithRoute.filter((v) => !v.has_departed).length
  const departedOnTime = vendorsWithRoute.filter((v) => v.departure_on_time).length
  const departedLate = departed - departedOnTime

  // Liquidation aggregates
  const closed = vendorsWithRoute.filter((v) => v.is_closed).length
  const liquidated = vendorsWithRoute.filter((v) => v.is_liquidated).length
  const pendingLiquidation = closed - liquidated

  return {
    date: dateStr,
    is_today: isToday,
    team_count: team.length,
    with_route: vendorsWithRoute.length,
    avg_compliance: avgCompliance,
    total_stops: totalStops,
    done_stops: doneStops,
    pending_stops: totalStops - doneStops,
    total_sales_target: totalSalesTarget,
    total_sales_actual: totalSalesActual,
    vendors_good: vendors.filter((v) => v.status === 'good').length,
    vendors_warning: vendors.filter((v) => v.status === 'warning').length,
    vendors_critical: vendors.filter((v) => v.status === 'critical').length,
    vendors_no_route: vendors.filter((v) => v.status === 'no_route').length,
    // Departure aggregates
    departed,
    not_departed: notDeparted,
    departed_on_time: departedOnTime,
    departed_late: departedLate,
    // Liquidation aggregates
    closed,
    liquidated,
    pending_liquidation: pendingLiquidation,
    vendors,
  }
}

// ── LIVE: Yesterday Summary (convenience wrapper) ──────────────────────────────

/**
 * Fetches yesterday's full overview. Convenience wrapper around getDayOverview.
 * @returns {Promise<Object>}
 */
export async function getYesterdaySummary() {
  return getDayOverview(getYesterdayStr())
}

// ── LIVE: Weekly Score ──────────────────────────────────────────────────────

/**
 * Builds a weekly compliance score grid (Mon-Sun) per vendor.
 * Uses week-routes and team endpoints.
 *
 * @returns {Promise<{
 *   weekDays: string[],
 *   vendorScores: Array<Object>,
 * }>}
 */
export async function getWeeklyScore() {
  const [weekRes, teamRes] = await Promise.allSettled([
    api('GET', '/pwa-supv/week-routes'),
    api('GET', '/pwa-supv/team'),
  ])

  const weekRoutes = weekRes.status === 'fulfilled' ? (Array.isArray(weekRes.value) ? weekRes.value : []) : []
  const team = teamRes.status === 'fulfilled' ? (Array.isArray(teamRes.value) ? teamRes.value : []) : []

  // Group routes by driver
  const byDriver = {}
  weekRoutes.forEach((r) => {
    const did = r.driver_id || r.salesperson_id
    if (!did) return
    if (!byDriver[did]) byDriver[did] = { routes: [], name: r.driver || r.salesperson }
    byDriver[did].routes.push(r)
  })

  // Build week days (Mon-Sun)
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
  const weekDays = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    weekDays.push(fmtDate(d))
  }

  // Build score per vendor per day
  const vendorScores = team.map((emp) => {
    const driverData = byDriver[emp.id] || { routes: [] }
    const days = weekDays.map((date) => {
      const route = driverData.routes.find((r) => r.date === date)
      return {
        date,
        has_route: !!route,
        stops_total: route?.stops_total || 0,
        stops_done: route?.stops_done || 0,
        compliance:
          route && route.stops_total > 0 ? Math.round((route.stops_done / route.stops_total) * 100) : null,
        state: route?.state || null,
      }
    })

    const totalStops = days.reduce((s, d) => s + d.stops_total, 0)
    const doneStops = days.reduce((s, d) => s + d.stops_done, 0)
    const weekCompliance = totalStops > 0 ? Math.round((doneStops / totalStops) * 100) : 0

    return {
      id: emp.id,
      name: emp.name,
      days,
      week_compliance: weekCompliance,
      total_stops: totalStops,
      done_stops: doneStops,
    }
  })

  return { weekDays, vendorScores }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a CSS color for a vendor status.
 * @param {'good'|'warning'|'critical'|'no_route'} status
 * @returns {string}
 */
export function getStatusColor(status) {
  switch (status) {
    case 'good':
      return '#22c55e'
    case 'warning':
      return '#f59e0b'
    case 'critical':
      return '#ef4444'
    case 'no_route':
      return 'rgba(255,255,255,0.3)'
    default:
      return 'rgba(255,255,255,0.5)'
  }
}

/**
 * Returns a CSS color based on compliance percentage.
 * @param {number} pct - Compliance percentage (0-100)
 * @returns {string}
 */
export function getComplianceColor(pct) {
  if (pct >= 80) return '#22c55e'
  if (pct >= 50) return '#f59e0b'
  return '#ef4444'
}

/**
 * Formats a number as abbreviated money string.
 * @param {number} n
 * @returns {string} e.g. "$1.2M", "$350K", "$99"
 */
export function fmtMoney(n) {
  if (!n && n !== 0) return '$0'
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${Math.round(n / 1000)}K`
  return `$${Math.round(n)}`
}

/**
 * Formats an Odoo datetime string to HH:MM
 * @param {string|null} t
 * @returns {string}
 */
export function fmtTime(t) {
  if (!t) return '--'
  if (t.includes('T') || t.includes(' ')) {
    try {
      const d = new Date(t.replace(' ', 'T'))
      return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    } catch { return '--' }
  }
  return String(t).slice(0, 5)
}

/**
 * Returns departure status info for a vendor
 * @param {Object} v - vendor from getDayOverview
 * @returns {{ label: string, color: string, icon: string }}
 */
export function getDepartureStatus(v) {
  if (!v.has_route) return { label: 'Sin ruta', color: 'rgba(255,255,255,0.3)', icon: '—' }
  if (!v.has_departed) return { label: 'No ha salido', color: '#f59e0b', icon: '⏳' }
  if (v.departure_on_time) return { label: 'Salio a tiempo', color: '#22c55e', icon: '✓' }
  return { label: 'Salio tarde', color: '#ef4444', icon: '⚠' }
}

/**
 * Returns liquidation status info for a vendor
 * @param {Object} v - vendor from getDayOverview
 * @returns {{ label: string, color: string }}
 */
export function getLiquidationStatus(v) {
  if (!v.has_route) return { label: 'Sin ruta', color: 'rgba(255,255,255,0.3)' }
  if (v.is_liquidated) return { label: 'Liquidado', color: '#22c55e' }
  if (v.is_closed) return { label: 'Cerrado (sin liquidar)', color: '#f59e0b' }
  return { label: 'En ruta', color: 'rgba(255,255,255,0.5)' }
}
