const JUNE_SALES_TARGET = 1800000

function isJuneDate(dateStr) {
  return /^\d{4}-06-\d{2}$/.test(String(dateStr || ''))
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
