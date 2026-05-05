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
