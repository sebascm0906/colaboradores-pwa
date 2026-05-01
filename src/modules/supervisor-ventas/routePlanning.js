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

export function getTomorrowDateString(baseDate = new Date()) {
  const d = new Date(baseDate)
  d.setDate(d.getDate() + 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
