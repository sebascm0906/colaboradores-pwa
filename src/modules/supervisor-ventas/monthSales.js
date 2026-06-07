const JUNE_SALES_TARGET = 1800000

function isJuneDate(dateStr) {
  return /^\d{4}-06-\d{2}$/.test(String(dateStr || ''))
}

function relationId(value) {
  const id = Array.isArray(value) ? Number(value[0] || 0) : Number(value || 0)
  return id || 0
}

function saleOrderIds(value) {
  if (!Array.isArray(value)) return []
  return value.map(relationId).filter(Boolean)
}

export function buildCedisMonthlySalesDomain({
  startMonth,
  endMonth,
  warehouseId,
  companyId,
} = {}) {
  const domain = [
    ['state', 'in', ['sale', 'done']],
    ['date_order', '>=', `${startMonth} 00:00:00`],
    ['date_order', '<', `${endMonth} 00:00:00`],
  ]
  if (Number(warehouseId || 0)) domain.push(['warehouse_id', '=', Number(warehouseId)])
  if (Number(companyId || 0)) domain.push(['company_id', '=', Number(companyId)])
  return domain
}

export function sumSaleOrderTotals(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const amount = Number(row?.amount_total || 0)
    return Number.isFinite(amount) ? sum + amount : sum
  }, 0)
}

export function resolveMonthlySalesActual(targets = [], summary = null) {
  const summaryTotal = Number(summary?.sales_actual ?? summary?.total_sales_actual)
  if (Number.isFinite(summaryTotal)) return summaryTotal
  return (Array.isArray(targets) ? targets : []).reduce((sum, target) => (
    sum + (Number(target?.sales_actual || 0) || 0)
  ), 0)
}

export function resolveMonthlySalesTarget(targets = [], dateStr = '') {
  const configuredTarget = (Array.isArray(targets) ? targets : []).reduce((sum, target) => (
    sum + (Number(target?.sales_target || 0) || 0)
  ), 0)
  if (configuredTarget > 0) return configuredTarget
  return isJuneDate(dateStr) ? JUNE_SALES_TARGET : 0
}

export function buildEmployeeMonthlySalesFromRouteData({
  plans = [],
  stops = [],
  saleOrders = [],
} = {}) {
  const employeeByPlan = new Map()
  for (const plan of Array.isArray(plans) ? plans : []) {
    const planId = Number(plan?.id || 0)
    const employeeId = relationId(plan?.driver_employee_id) || relationId(plan?.salesperson_employee_id)
    if (planId && employeeId) employeeByPlan.set(planId, employeeId)
  }

  const amountByOrder = new Map()
  for (const order of Array.isArray(saleOrders) ? saleOrders : []) {
    const orderId = Number(order?.id || 0)
    const amount = Number(order?.amount_total || 0)
    if (orderId && Number.isFinite(amount)) amountByOrder.set(orderId, amount)
  }

  const orderIdsByEmployee = new Map()
  for (const stop of Array.isArray(stops) ? stops : []) {
    const planId = relationId(stop?.route_plan_id)
    const employeeId = employeeByPlan.get(planId)
    if (!employeeId) continue
    if (!orderIdsByEmployee.has(employeeId)) orderIdsByEmployee.set(employeeId, new Set())
    const target = orderIdsByEmployee.get(employeeId)
    for (const orderId of saleOrderIds(stop?.sale_order_ids)) {
      target.add(orderId)
    }
  }

  return [...orderIdsByEmployee.entries()]
    .map(([employeeId, orderIds]) => ({
      employee_id: employeeId,
      sales_actual: [...orderIds].reduce((sum, orderId) => sum + (amountByOrder.get(orderId) || 0), 0),
      sales_count: orderIds.size,
    }))
    .sort((a, b) => a.employee_id - b.employee_id)
}

export function resolveEmployeeMonthlySalesActual(employeeId, target = null, summary = null) {
  const resolvedEmployeeId = Number(employeeId || 0)
  const rows = Array.isArray(summary?.employee_sales) ? summary.employee_sales : []
  const row = rows.find((item) => Number(item?.employee_id || 0) === resolvedEmployeeId)
  if (row) return Number(row.sales_actual || 0) || 0
  return Number(target?.sales_actual || 0) || 0
}
