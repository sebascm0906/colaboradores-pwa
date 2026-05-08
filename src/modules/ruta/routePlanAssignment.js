export function buildMyRoutePlanPath(employeeId, criteria = {}) {
  const qs = new URLSearchParams()
  const planId = Number(criteria?.plan_id || criteria?.route_plan_id || 0)
  if (employeeId) qs.set('employee_id', String(employeeId))
  if (planId) qs.set('plan_id', String(planId))
  if (criteria?.date) qs.set('date', String(criteria.date))
  if (criteria?.vehicle_id) qs.set('vehicle_id', String(Number(criteria.vehicle_id)))
  if (criteria?.mobile_location_id) qs.set('mobile_location_id', String(Number(criteria.mobile_location_id)))
  return `/pwa-ruta/my-plan${qs.toString() ? `?${qs}` : ''}`
}

export function normalizeRoutePlanResponse(plan) {
  if (!plan || typeof plan !== 'object') return plan
  const planId = Number(plan.id || plan.plan_id || plan.route_plan_id || 0)
  if (!planId) return plan
  return {
    ...plan,
    id: planId,
    plan_id: Number(plan.plan_id || planId),
    route_plan_id: Number(plan.route_plan_id || planId),
    vehicle_id: Number(Array.isArray(plan.vehicle_id) ? plan.vehicle_id[0] : plan.vehicle_id || 0) || false,
    mobile_location_id: Number(Array.isArray(plan.mobile_location_id) ? plan.mobile_location_id[0] : plan.mobile_location_id || 0) || false,
  }
}
