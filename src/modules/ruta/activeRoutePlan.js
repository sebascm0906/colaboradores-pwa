const STORAGE_KEY = 'gf_ruta_active_plan'

const OPERABLE_STATES = new Set(['draft', 'published', 'in_progress'])
const ACTIVE_STATES = new Set(['in_progress'])
const CLOSED_STATES = new Set(['closed', 'reconciled', 'cancel', 'cancelled'])

function storageKey(employeeId) {
  return `${STORAGE_KEY}:${Number(employeeId || 0)}`
}

export function getStoredActiveRoutePlanId(employeeId) {
  try {
    return Number(sessionStorage.getItem(storageKey(employeeId)) || localStorage.getItem(storageKey(employeeId)) || 0)
  } catch {
    return 0
  }
}

export function setStoredActiveRoutePlanId(employeeId, planId) {
  const value = String(Number(planId || 0))
  try {
    sessionStorage.setItem(storageKey(employeeId), value)
    localStorage.setItem(storageKey(employeeId), value)
  } catch {
    // Storage may be unavailable in private mode; runtime state still works.
  }
}

export function clearStoredActiveRoutePlanId(employeeId) {
  try {
    sessionStorage.removeItem(storageKey(employeeId))
    localStorage.removeItem(storageKey(employeeId))
  } catch {
    // ignore storage failures
  }
}

export function normalizeRoutePlansResponse(response) {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.plans)) return response.plans
  if (Array.isArray(response?.data?.plans)) return response.data.plans
  return []
}

export function chooseRoutePlan(plans, employeeId) {
  const list = normalizeRoutePlansResponse(plans).filter(Boolean)
  if (list.length === 0) return null

  const storedId = getStoredActiveRoutePlanId(employeeId)
  const storedPlan = storedId ? list.find((plan) => Number(plan.id || plan.plan_id) === storedId) : null
  const storedState = String(storedPlan?.state || '').toLowerCase()
  if (storedId && (!storedPlan || CLOSED_STATES.has(storedState))) {
    clearStoredActiveRoutePlanId(employeeId)
  } else if (storedPlan && OPERABLE_STATES.has(storedState)) {
    return storedPlan
  }

  const operable = list.filter((plan) => OPERABLE_STATES.has(String(plan.state || '').toLowerCase()))
  const active = operable.filter((plan) => ACTIVE_STATES.has(String(plan.state || '').toLowerCase()))

  if (active.length === 1) {
    setStoredActiveRoutePlanId(employeeId, active[0].id || active[0].plan_id)
    return active[0]
  }

  if (operable.length === 1) {
    setStoredActiveRoutePlanId(employeeId, operable[0].id || operable[0].plan_id)
    return operable[0]
  }

  if (list.length === 1) {
    return list[0]
  }

  return null
}

export function routePlanDisplayName(plan) {
  const shiftLabels = {
    morning: 'Manana',
    afternoon: 'Tarde',
    extra: 'Extra',
  }
  const shift = shiftLabels[plan?.shift_type] || plan?.shift_type || 'Viaje'
  const id = plan?.id || plan?.plan_id || ''
  const state = plan?.state ? `, ${plan.state}` : ''
  const ref = plan?.name || plan?.route || 'Plan'
  const time = plan?.departure_time_target || plan?.start_at || plan?.create_date || ''
  const suffix = time ? ` (${time}${state})` : (state ? ` (${state.slice(2)})` : '')
  return `${shift} #${id} - ${ref}${suffix}`.trim()
}
