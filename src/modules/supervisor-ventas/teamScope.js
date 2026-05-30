export const SUPV_ROUTE_EMPLOYEE_FIELDS = [
  'salesperson_employee_id',
  'driver_employee_id',
  'assistant_employee_id',
  'employee_id',
  'assigned_employee_id',
  'salesperson_id',
  'driver_id',
  'user_employee_id',
]

export function routeEmployeeId(value) {
  const id = Array.isArray(value) ? Number(value[0] || 0) : Number(value || 0)
  return id || 0
}

export function collectRouteEmployeeIds(routes, fields = SUPV_ROUTE_EMPLOYEE_FIELDS) {
  const ids = new Set()
  for (const route of Array.isArray(routes) ? routes : []) {
    for (const field of fields) {
      const id = routeEmployeeId(route?.[field])
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

export function filterRoutesByEmployeeScope(routes, allowedEmployeeIds, fields = SUPV_ROUTE_EMPLOYEE_FIELDS) {
  const allowed = new Set((Array.isArray(allowedEmployeeIds) ? allowedEmployeeIds : []).map(Number).filter(Boolean))
  if (!allowed.size) return []
  return (Array.isArray(routes) ? routes : []).filter((route) => (
    fields.some((field) => allowed.has(routeEmployeeId(route?.[field])))
  ))
}

export function filterRouteSuggestionsByDriverScope(suggestions, allowedEmployeeIds) {
  const allowed = new Set((Array.isArray(allowedEmployeeIds) ? allowedEmployeeIds : []).map(Number).filter(Boolean))
  if (!allowed.size) return []
  return (Array.isArray(suggestions) ? suggestions : [])
    .map((suggestion) => {
      const options = Array.isArray(suggestion?.valid_route_options)
        ? suggestion.valid_route_options
        : []
      const scopedOptions = options.filter((option) => {
        const driverId = routeEmployeeId(
          option?.driver_employee_id
          || option?.driver_id
          || option?.planned_driver_id
        )
        return driverId && allowed.has(driverId)
      })
      return { ...suggestion, valid_route_options: scopedOptions }
    })
    .filter((suggestion) => (
      suggestion.route_resolution_status === 'resolved'
      || suggestion.resolved_route_id
      || (Array.isArray(suggestion.valid_route_options) && suggestion.valid_route_options.length > 0)
    ))
}
