// ─── API Jefe de Ruta — Complemento a KoldField ─────────────────────────────

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
