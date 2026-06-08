export function resolveSupervisorCustomerAnalyticUnitId({
  sessionAnalyticAccountId = 0,
  employeeAnalyticAccountId = 0,
  fallbackAnalyticUnitId = 0,
} = {}) {
  const sessionId = Number(sessionAnalyticAccountId || 0)
  if (sessionId > 0) return sessionId

  const employeeId = Number(employeeAnalyticAccountId || 0)
  if (employeeId > 0) return employeeId

  const fallbackId = Number(fallbackAnalyticUnitId || 0)
  return fallbackId > 0 ? fallbackId : 0
}

export function buildSupervisorCustomerDomains(analyticUnitId) {
  const resolvedAnalyticUnitId = Number(analyticUnitId || 0)
  if (!resolvedAnalyticUnitId) return [['id', '=', 0]]
  return [
    ['active', '=', true],
    ['x_analytic_un_id', '=', resolvedAnalyticUnitId],
  ]
}
