function toM2oId(value) {
  if (Array.isArray(value)) return Number(value[0] || 0) || 0
  if (value && typeof value === 'object') return Number(value.id || 0) || 0
  return Number(value || 0) || 0
}

function toM2oName(value, fallback = '') {
  if (Array.isArray(value)) return String(value[1] || fallback || '')
  if (value && typeof value === 'object') return String(value.name || fallback || '')
  return String(fallback || '')
}

function toNumberList(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => Number(value || 0))
    .filter(Boolean)
}

// ── Demand classes (F1) ──────────────────────────────────────────────────────
// Backend semantics for `/gf/salesops/supervisor/v2/route_plan/ensure`:
//   - field absent / null / [] → no restriction (todas las clasificaciones)
//   - ["AA","A","B","C"] (subset) → filter customers by those classes
//   - any other value → backend responds VALIDATION_ERROR (demand_class_invalid)
// The PWA always sends an array (defaulting to []) so a previous filter never
// stays pegado en el plan al re-asegurarlo.

export const DEMAND_CLASSES = ['AA', 'A', 'B', 'C']

/**
 * Filtra y normaliza clases válidas (AA/A/B/C). Devuelve un array (puede ser
 * vacío). Mantiene el orden canónico AA → C, sin duplicados.
 */
export function sanitizeDemandClasses(values) {
  if (!Array.isArray(values)) return []
  const seen = new Set()
  for (const raw of values) {
    const v = String(raw || '').trim().toUpperCase()
    if (DEMAND_CLASSES.includes(v)) seen.add(v)
  }
  return DEMAND_CLASSES.filter((c) => seen.has(c))
}

/**
 * Devuelve el resumen humano para mostrar en UI:
 *   []           → "Todas"
 *   ["AA"]       → "AA"
 *   ["AA","A"]   → "AA/A"
 *   ["AA","A","B","C"] → "AA/A/B/C"
 */
export function getDemandClassesSummary(values) {
  const cleaned = sanitizeDemandClasses(values)
  if (cleaned.length === 0) return 'Todas'
  return cleaned.join('/')
}

export function getTomorrowDateString(baseDate = new Date()) {
  const d = new Date(baseDate)
  d.setDate(d.getDate() + 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function getPlanningDateBounds(baseDate = new Date()) {
  const minDate = getTomorrowDateString(baseDate)
  return {
    defaultDate: minDate,
    minDate,
  }
}

export function isFuturePlanningDate(dateStr, baseDate = new Date()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))
    && String(dateStr) >= getTomorrowDateString(baseDate)
}

export function getRoutePlanningState(row = {}) {
  if (row.blocked) return 'blocked'
  if (row.load_sealed) return 'load_executed'
  if (toM2oId(row.load_picking_id)) return 'load_ready'
  if (String(row.forecast_state || '').toLowerCase() === 'confirmed') return 'forecast_confirmed'
  if (toM2oId(row.plan_id)) return 'plan_draft'
  return 'sin_plan'
}

export function normalizeRoutePlanningRow(row = {}) {
  const employee = row.employee_id || row.salesperson_employee_id || row.driver_employee_id
  const normalized = {
    route_id: toM2oId(row.route_id) || Number(row.route_id || 0) || 0,
    route_name: row.route_name || row.name || '',
    employee_id: toM2oId(employee),
    employee_name: toM2oName(employee, row.employee_name || ''),
    plan_id: toM2oId(row.plan_id),
    plan_state: row.plan_state || '',
    forecast_id: toM2oId(row.forecast_id),
    forecast_state: row.forecast_state || '',
    load_picking_id: toM2oId(row.load_picking_id),
    load_sealed: row.load_sealed === true,
    date_target: row.date_target || row.date || '',
    blocked: row.blocked === true,
    block_reason: row.block_reason || '',
  }
  normalized.state = getRoutePlanningState(normalized)
  return normalized
}

export function buildRouteForecastPayload({ routeId, planId, dateTarget, lines }) {
  return {
    route_id: Number(routeId || 0),
    route_plan_id: Number(planId || 0),
    date_target: dateTarget,
    lines: (Array.isArray(lines) ? lines : [])
      .filter((l) => l?.product_id && Number(l.qty) > 0)
      .map((l) => ({
        product_id: Number(l.product_id),
        channel: l.channel || 'Van',
        qty: Number(l.qty),
      })),
  }
}

export function getDefaultTimeWindow() {
  return { id: null, key: 'any', label: 'Cualquier hora' }
}

export function buildRoutePlanCriteriaPayload({
  routeId,
  dateTarget,
  polygonId,
  subpolygonId,
  channelIds,
  visitDays,
  timeWindowId,
  demandClasses,
}) {
  return {
    route_id: Number(routeId || 0),
    date_target: dateTarget,
    polygon_id: Number(polygonId || 0),
    subpolygon_id: subpolygonId ? Number(subpolygonId) : null,
    channel_ids: toNumberList(channelIds),
    visit_days: Array.isArray(visitDays) ? visitDays.filter(Boolean) : [],
    time_window_id: timeWindowId ? Number(timeWindowId) : null,
    // Always send (even []) para limpiar filtros pegados de un ensure previo.
    demand_classes: sanitizeDemandClasses(demandClasses),
  }
}

export function normalizeActiveRoutePlan(row = {}) {
  return {
    id: Number(row.id || 0),
    name: row.name || '',
    route_id: toM2oId(row.route_id),
    route_name: toM2oName(row.route_id),
    driver_id: toM2oId(row.driver_employee_id),
    driver_name: toM2oName(row.driver_employee_id),
    state: row.state || '',
    stops_total: Number(row.stops_total || 0),
  }
}

export function normalizeCustomerSearchResult(row = {}) {
  return {
    id: Number(row.id || 0),
    name: row.name || '',
    address: row.street || row.contact_address || '',
    channels: (Array.isArray(row.channel_ids) ? row.channel_ids : [])
      .map((item) => Array.isArray(item) ? item[1] : String(item || ''))
      .filter(Boolean),
    visit_days: Array.isArray(row.visit_days) ? row.visit_days : [],
    time_window: toM2oName(row.time_window_id),
    latitude: Number(row.latitude || row.partner_latitude || 0) || null,
    longitude: Number(row.longitude || row.partner_longitude || 0) || null,
  }
}

export function getSupervisorRouteErrorMessage(error = {}) {
  const code = error.code || error?.data?.code
  const messages = {
    polygon_required: 'Selecciona un poligono para generar la ruta.',
    polygon_not_found: 'No se encontro el poligono o no pertenece a tu CEDIS.',
    subpolygon_outside_polygon: 'El subpoligono no pertenece al poligono seleccionado.',
    no_customers_found: 'No hay clientes para los filtros seleccionados. Avisa al administrador que revise poligonos y datos de clientes.',
    missing_customer_geo: 'El cliente no tiene ubicacion geografica suficiente.',
    customer_already_in_plan: 'El cliente ya esta en este plan diario.',
    plan_not_editable: 'Este plan ya no permite agregar clientes.',
    // F1: validación de clases de demanda en backend.
    demand_class_invalid: 'Clasificacion invalida. Usa solo AA, A, B o C.',
    demand_classes_invalid: 'Clasificacion invalida. Usa solo AA, A, B o C.',
  }
  return messages[code] || error.message || error.error || 'No se pudo completar la operacion.'
}

export function buildPolygonMarkerStyle({ hasPolygon = true, polygonColor = '#2f80ed', subpolygonLetter = '' } = {}) {
  return {
    background: hasPolygon ? polygonColor : '#000000',
    color: '#ffffff',
    label: subpolygonLetter || '',
    size: 18,
  }
}
