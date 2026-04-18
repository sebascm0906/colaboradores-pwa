// ─── API Jefe de Ruta — Complemento a KoldField ─────────────────────────────
import { api } from '../../lib/api'

// ── Plan de ruta ─────────────────────────────────────────────────────────────

/** Plan de ruta del día para el chofer autenticado */
export function getMyRoutePlan(employeeId) {
  return api('GET', `/pwa-ruta/my-plan?employee_id=${employeeId}`)
}

// ── Checklist de unidad ──────────────────────────────────────────────────────

/** Obtener checklist de revisión de unidad del día */
export function getVehicleChecklist(routePlanId) {
  return api('GET', `/pwa-ruta/vehicle-checklist?route_plan_id=${routePlanId}`)
}

/** Enviar respuesta de un punto del checklist */
export function submitVehicleCheck(checkId, data) {
  return api('POST', '/pwa-ruta/vehicle-check', { check_id: checkId, ...data })
}

/** Completar checklist de unidad */
export function completeVehicleChecklist(checklistId) {
  return api('POST', '/pwa-ruta/vehicle-checklist-complete', { checklist_id: checklistId })
}

// ── Aceptar carga ────────────────────────────────────────────────────────────

/** Ver carga asignada para mi ruta */
export function getMyLoad(routePlanId) {
  return api('GET', `/pwa-ruta/my-load?route_plan_id=${routePlanId}`)
}

/** Aceptar/confirmar la carga recibida */
export function acceptLoad(routePlanId) {
  return api('POST', '/pwa-ruta/accept-load', { route_plan_id: routePlanId })
}

// ── Incidencias ──────────────────────────────────────────────────────────────

/** Reportar incidencia */
export function createIncident(data) {
  return api('POST', '/pwa-ruta/incident-create', data)
}

/** Incidencias del día */
export function getMyIncidents(employeeId) {
  return api('GET', `/pwa-ruta/my-incidents?employee_id=${employeeId}`)
}

// ── KPIs y metas ─────────────────────────────────────────────────────────────

/** Meta mensual del vendedor */
export function getMyTarget(employeeId) {
  return api('GET', `/pwa-ruta/my-target?employee_id=${employeeId}`)
}

// ── Conciliación ─────────────────────────────────────────────────────────────

/** Conciliación del plan de ruta */
export function getReconciliation(routePlanId) {
  return api('GET', `/pwa-ruta/reconciliation?route_plan_id=${routePlanId}`)
}

// ── Detalle de carga (SKU/cantidades) ────────────────────────────────────────

/** Líneas de producto del picking de carga */
export function getLoadLines(pickingId) {
  return api('GET', `/pwa-ruta/load-lines?picking_id=${pickingId}`)
}

// ── Checklist de vehículo (auto-creación) ────────────────────────────────────

/** Crear contenedor dummy shift para checklist */
export function createVehicleChecklistShift(employeeId) {
  return api('POST', '/pwa-ruta/vehicle-checklist-create', { employee_id: employeeId })
}

/** Inicializar checklist + checks desde template */
export function initVehicleChecklist(shiftId, employeeId) {
  return api('POST', '/pwa-ruta/vehicle-checklist-init', { shift_id: shiftId, employee_id: employeeId })
}

/** Leer checks de un checklist */
export function getVehicleChecks(checklistId) {
  return api('GET', `/pwa-ruta/vehicle-checks?checklist_id=${checklistId}`)
}

// ── KM persistente (gf_logistics_ops) ───────────────────────────────────────

/** Registrar KM (salida o llegada) en backend */
export function updateKm(planId, type, km) {
  return api('POST', '/pwa-ruta/km-update', { plan_id: planId, type, km })
}

// ── Liquidación real (gf_logistics_ops) ─────────────────────────────────────

/** Obtener liquidacion agregada por buckets desde payments posteados */
export function getLiquidation(planId) {
  return api('POST', '/pwa-ruta/liquidation', { plan_id: planId })
}

// ── Cierre de ruta real (gf_logistics_ops) ──────────────────────────────────

/** Cerrar ruta con validacion server-side */
export function closeRoute(planId, departureKm, arrivalKm) {
  return api('POST', '/pwa-ruta/close-route', {
    plan_id: planId,
    departure_km: departureKm,
    arrival_km: arrivalKm,
  })
}

// ── Liquidación confirmar (gf_logistics_ops, endpoint real 4a/4b) ────────────

/** Confirma la liquidación del plan. Backend valida que total_collected = total_expected.
 *  Si hay diferencia y `force` != true, retorna { ok:false, code:'difference_warning',
 *  data: { total_collected, total_expected, ... } } para que la UI pida override.
 *  Llamar de nuevo con `force=true` para persistir pese a diferencia.
 *  Endpoint real: POST /gf/logistics/api/employee/liquidacion/confirm */
export function confirmLiquidacion(planId, { notes = '', force = false } = {}) {
  return api('POST', '/gf/logistics/api/employee/liquidacion/confirm', {
    plan_id: Number(planId),
    notes:   String(notes || '').trim(),
    force:   Boolean(force),
  })
}

// ── Incidencias del equipo (A2 — catálogo 7 tipos) ──────────────────────────

/** Lista de incidencias del equipo para una fecha dada.
 *  Endpoint: GET /pwa-ruta/team-incidents?date=YYYY-MM-DD
 *  Filtro opcional: ?route_ids=1,2,3 para supervisores/gerentes. */
export function getTeamIncidents({ date, routeIds } = {}) {
  const qs = new URLSearchParams()
  if (date) qs.set('date', date)
  if (Array.isArray(routeIds) && routeIds.length > 0) {
    qs.set('route_ids', routeIds.join(','))
  }
  return api('GET', `/pwa-ruta/team-incidents${qs.toString() ? `?${qs}` : ''}`)
}

// ── Tipos de incidencias (catálogo del backend) ──────────────────────────────

/** Catálogo fijo del backend — 7 tipos según spec A2.
 *  Mantener sincronizado con gf_logistics_ops selection. */
export const INCIDENT_TYPE_CATALOG = [
  { id: 'retraso_ruta',         label: 'Retraso en ruta' },
  { id: 'falta_producto',       label: 'Falta de producto' },
  { id: 'sobrante_producto',    label: 'Sobrante de producto' },
  { id: 'devolucion_fuera',     label: 'Devolución fuera de rango' },
  { id: 'falla_mecanica',       label: 'Falla mecánica' },
  { id: 'cliente_no_atendido',  label: 'Cliente no atendido' },
  { id: 'cobro_no_realizado',   label: 'Cobro no realizado' },
]
