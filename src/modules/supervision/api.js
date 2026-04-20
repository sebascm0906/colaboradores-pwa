// ─── API Supervisión Producción ──────────────────────────────────────────────
// Fase 6: funciones operativas que todavia usan BFF legacy (/pwa-sup/*).
// Cuando existan endpoints REST reales, migrar a productionAPI.js.
//
// ELIMINADAS en Fase 6:
//   - closeShift (reemplazada por supervisorAuth.closeShiftServerSide)
//
// OPERATIVAS (sin reemplazo REST aun, siguen via BFF):
//   - dashboard, operators, active-shift, shift-create
//   - downtimes, downtime-categories, downtime-create, downtime-close
//   - scraps, scrap-reasons, scrap-products, scrap-create
//   - energy, energy-create
//   - maintenance, maintenance-create

import { api } from '../../lib/api'

// ── Dashboard ────────────────────────────────────────────────────────────────
export function getShiftDashboard() { return api('GET', '/pwa-sup/dashboard') }
export function getShiftOperators(shiftId) { return api('GET', `/pwa-sup/operators?shift_id=${shiftId}`) }

// ── Turnos ───────────────────────────────────────────────────────────────────
// getActiveShift: el BFF `/pwa-sup/active-shift` delega a `/api/production/
// shift/current` (autoridad Odoo, soporta turnos nocturnos) y lo enriquece
// con `/api/production/dashboard` para KPIs y `open_maintenance_requests`.
export function getActiveShift(warehouseId) {
  const qs = warehouseId ? `?warehouse_id=${Number(warehouseId)}` : ''
  return api('GET', `/pwa-sup/active-shift${qs}`)
}
export function createShift(data) { return api('POST', '/pwa-sup/shift-create', data) }
export function startShift(data) { return api('POST', '/pwa-sup/shift-start', data) }

// ── Paros (sin reemplazo REST aun) ──────────────────────────────────────────
export function getDowntimes(shiftId) { return api('GET', `/pwa-sup/downtimes?shift_id=${shiftId}`) }
export function getDowntimeCategories() { return api('GET', '/pwa-sup/downtime-categories') }
export function createDowntime(data) { return api('POST', '/pwa-sup/downtime-create', data) }
export function closeDowntime(downtimeId) { return api('POST', '/pwa-sup/downtime-close', { downtime_id: downtimeId }) }

// ── Merma (sin reemplazo REST aun) ──────────────────────────────────────────
export function getScraps(shiftId) { return api('GET', `/pwa-sup/scraps?shift_id=${shiftId}`) }
export function getScrapReasons() { return api('GET', '/pwa-sup/scrap-reasons') }
export function getScrapProducts() { return api('GET', '/pwa-sup/scrap-products') }
export function createScrap(data) { return api('POST', '/pwa-sup/scrap-create', data) }

// ── Energía (sin reemplazo REST aun) ────────────────────────────────────────
export function getEnergyReadings(shiftId) { return api('GET', `/pwa-sup/energy?shift_id=${shiftId}`) }
export function createEnergyReading(data) { return api('POST', '/pwa-sup/energy-create', data) }

// ── Mantenimiento (sin reemplazo REST aun) ──────────────────────────────────
export function getMaintenanceRequests() { return api('GET', '/pwa-sup/maintenance') }
export function createMaintenanceRequest(data) { return api('POST', '/pwa-sup/maintenance-create', data) }

// ── Salmuera por tanque ──────────────────────────────────────────────────────
export function createBrineReading(data) { return api('POST', '/pwa-sup/brine-reading-create', data) }
