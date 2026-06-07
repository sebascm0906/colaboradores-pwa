function fmtCompactMoney(value) {
  const n = Number(value || 0)
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${Math.round(n / 1000)}K`
  return `$${Math.round(n)}`
}

export function buildSupervisorDashboardFallback(overview = {}) {
  const compliance = Number(overview.avg_compliance || 0)
  const doneStops = Number(overview.done_stops || 0)
  const totalStops = Number(overview.total_stops || 0)
  const salesActual = Number(overview.total_sales_actual || 0)
  const departed = Number(overview.departed || 0)
  const withRoute = Number(overview.with_route || 0)
  const liquidated = Number(overview.liquidated || 0)
  const closed = Number(overview.closed || 0)
  const pendingLiquidation = Number(overview.pending_liquidation || 0)

  return {
    hero: {
      value: `${compliance}%`,
      label: 'Cumplimiento del dia',
    },
    cards: [
      { label: 'Visitas', value: `${doneStops}/${totalStops}` },
      { label: 'Ventas mes', value: fmtCompactMoney(salesActual) },
      { label: 'Salidas', value: `${departed}/${withRoute}` },
      { label: 'Liquidados', value: String(liquidated) },
    ],
    breakdown: [
      { label: 'Criticos', value: String(Number(overview.vendors_critical || 0)) },
      { label: 'Alerta', value: String(Number(overview.vendors_warning || 0)) },
      { label: 'Bien', value: String(Number(overview.vendors_good || 0)) },
    ],
    footer: `${closed} cerrados · ${pendingLiquidation} pendientes por liquidar`,
  }
}
