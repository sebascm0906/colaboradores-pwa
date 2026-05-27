export const ROUTE_FORMATS = [
  { id: 'sales', label: 'Ventas' },
  { id: 'inventory', label: 'Inventario cargado' },
  { id: 'scrap', label: 'Mermas' },
  { id: 'corte', label: 'Corte' },
  { id: 'liquidation', label: 'Liquidacion' },
]

const CLOSED_STATES = new Set(['closed', 'reconciled', 'done'])

const PAYMENT_LABELS = {
  cash: 'Efectivo',
  credit: 'Credito',
  transfer: 'Transferencia',
  card: 'Tarjeta',
}

function number(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function text(value, fallback = '') {
  if (value == null || value === false) return fallback
  if (Array.isArray(value)) return text(value[1], fallback)
  return String(value)
}

function money(value) {
  return '$' + number(value).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizePlan(detail = {}) {
  const state = text(detail.state || detail.plan_state).toLowerCase()
  return {
    id: detail.id || detail.plan_id || '',
    name: text(detail.name || detail.plan_name || (detail.id ? `Plan #${detail.id}` : 'Plan de ruta')),
    routeName: text(detail.route_name || detail.route || detail.route_id, 'Ruta'),
    driverName: text(detail.driver_name || detail.driver || detail.salesperson_name || detail.salesperson, 'Chofer'),
    vehicleName: text(detail.vehicle_name || detail.vehicle || detail.vehicle_id, ''),
    date: text(detail.date || detail.route_date || detail.closed_date || detail.validated_date, ''),
    state,
  }
}

function isFormatEnabled(plan) {
  if (!plan.state) return true
  return CLOSED_STATES.has(plan.state)
}

function rawLines(detail = {}) {
  const candidates = [
    detail.reconciliation_lines,
    detail.lines,
    detail.inventory_lines,
    detail.corte_lines,
  ]
  return candidates.find(Array.isArray) || []
}

function normalizeLine(line = {}) {
  const product = text(line.product_name || line.product || line.product_id, 'Producto')
  const loaded = number(line.qty_loaded ?? line.loaded ?? line.product_uom_qty ?? line.quantity)
  const delivered = number(line.qty_delivered ?? line.delivered)
  const returned = number(line.qty_returned ?? line.returned)
  const scrap = number(line.qty_scrap ?? line.scrap)
  const difference = number(line.qty_difference ?? line.difference ?? (loaded - delivered - returned - scrap))

  return {
    id: line.id || `${product}-${loaded}-${delivered}-${returned}-${scrap}`,
    product,
    loaded,
    delivered,
    returned,
    scrap,
    difference,
  }
}

function sumLines(lines) {
  return lines.reduce((totals, line) => ({
    loaded: totals.loaded + number(line.loaded),
    delivered: totals.delivered + number(line.delivered),
    returned: totals.returned + number(line.returned),
    scrap: totals.scrap + number(line.scrap),
    difference: totals.difference + number(line.difference),
  }), { loaded: 0, delivered: 0, returned: 0, scrap: 0, difference: 0 })
}

function normalizePaymentEntries(summary = {}) {
  const rows = []

  if (Array.isArray(summary.payments)) {
    for (const payment of summary.payments) {
      rows.push({
        method: text(payment.method || payment.payment_method || payment.name, 'Metodo'),
        label: PAYMENT_LABELS[payment.method] || text(payment.label || payment.method || payment.name, 'Metodo'),
        amount: number(payment.amount ?? payment.total),
      })
    }
    return rows
  }

  const byMethod = summary.by_method && typeof summary.by_method === 'object'
    ? summary.by_method
    : null

  if (byMethod) {
    for (const [method, value] of Object.entries(byMethod)) {
      rows.push({
        method,
        label: PAYMENT_LABELS[method] || method,
        amount: typeof value === 'object' ? number(value.total ?? value.amount) : number(value),
      })
    }
    return rows
  }

  for (const method of ['cash', 'credit', 'transfer', 'card']) {
    const value = summary[method]
    if (value == null) continue
    rows.push({
      method,
      label: PAYMENT_LABELS[method] || method,
      amount: typeof value === 'object' ? number(value.total ?? value.amount) : number(value),
    })
  }

  return rows
}

function normalizeLiquidation(detail = {}) {
  const summary = detail.summary || detail.liquidation_summary || {}
  const rows = normalizePaymentEntries(summary)
  const collected = number(summary.total_collected ?? summary.collected_total ?? rows.reduce((sum, row) => sum + row.amount, 0))
  const expected = number(summary.total_expected ?? summary.expected_total ?? collected)
  const difference = number(summary.difference ?? (collected - expected))

  return {
    rows,
    totals: { expected, collected, difference },
    empty: rows.length === 0 && expected === 0 && collected === 0,
  }
}

function rawSales(detail = {}) {
  const candidates = [
    detail.sales,
    detail.orders,
    detail.sale_orders,
    detail.sales_lines,
    detail.sale_lines,
  ]
  return candidates.find(Array.isArray) || []
}

function normalizeSale(row = {}) {
  const folio = text(row.folio || row.name || row.order_name || row.sale_order || row.sale_order_name, 'Venta')
  const customer = text(row.customer_name || row.partner_name || row.customer || row.partner_id, 'Cliente')
  const method = text(row.payment_method || row.method || row.payment_type || row.payment_label, '')
  const amount = number(row.amount_total ?? row.total ?? row.amount ?? row.price_total)

  return {
    id: row.id || folio,
    folio,
    customer,
    method,
    amount,
  }
}

function normalizeSales(detail = {}) {
  const rows = rawSales(detail).map(normalizeSale)
  return {
    rows,
    totals: { amount: rows.reduce((sum, row) => sum + row.amount, 0) },
    unavailable: rows.length === 0,
  }
}

function buildFormats(detail = {}) {
  const lines = rawLines(detail).map(normalizeLine)
  const lineTotals = sumLines(lines)
  const scrapRows = lines.filter((line) => line.scrap > 0)

  return {
    sales: normalizeSales(detail),
    inventory: {
      rows: lines.map((line) => ({ id: line.id, product: line.product, loaded: line.loaded })),
      totals: { loaded: lineTotals.loaded },
      empty: lines.length === 0,
    },
    scrap: {
      rows: scrapRows.map((line) => ({ id: line.id, product: line.product, scrap: line.scrap })),
      totals: { scrap: scrapRows.reduce((sum, line) => sum + line.scrap, 0) },
      empty: scrapRows.length === 0,
    },
    corte: {
      rows: lines,
      totals: lineTotals,
      empty: lines.length === 0,
    },
    liquidation: normalizeLiquidation(detail),
  }
}

export function buildRouteFormatsViewModel(detail = {}) {
  const plan = normalizePlan(detail)
  const enabled = isFormatEnabled(plan)

  return {
    enabled,
    blockedReason: enabled ? '' : 'Los formatos solo estan disponibles cuando la ruta esta cerrada.',
    plan,
    formatDefinitions: ROUTE_FORMATS,
    formats: buildFormats(detail),
  }
}

function getFormatTitle(formatId) {
  return ROUTE_FORMATS.find((format) => format.id === formatId)?.label || 'Formato'
}

function table(headers, rows) {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
  const body = rows.map((row) => (
    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
  )).join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function formatRows(vm, formatId) {
  const format = vm.formats[formatId]
  if (!format) return [['Sin datos']]

  if (formatId === 'sales') {
    if (format.unavailable) return [['Lista de ventas no disponible en este endpoint.']]
    return table(
      ['Folio', 'Cliente', 'Metodo', 'Total'],
      format.rows.map((row) => [row.folio, row.customer, row.method || '-', money(row.amount)]),
    )
  }

  if (formatId === 'inventory') {
    if (format.empty) return [['Sin inventario cargado disponible.']]
    return table(
      ['Producto', 'Cargado'],
      format.rows.map((row) => [row.product, row.loaded]),
    )
  }

  if (formatId === 'scrap') {
    if (format.empty) return [['Sin mermas registradas.']]
    return table(
      ['Producto', 'Merma'],
      format.rows.map((row) => [row.product, row.scrap]),
    )
  }

  if (formatId === 'corte') {
    if (format.empty) return [['Sin corte disponible.']]
    return table(
      ['Producto', 'Cargado', 'Entregado', 'Devuelto', 'Merma', 'Diferencia'],
      format.rows.map((row) => [row.product, row.loaded, row.delivered, row.returned, row.scrap, row.difference]),
    )
  }

  if (formatId === 'liquidation') {
    if (format.empty) return [['Sin liquidacion disponible.']]
    return table(
      ['Metodo', 'Importe'],
      format.rows.map((row) => [row.label, money(row.amount)]),
    )
  }

  return [['Sin datos']]
}

function formatTotals(vm, formatId) {
  const format = vm.formats[formatId]
  if (!format?.totals) return ''

  if (formatId === 'sales') return `<p><strong>Total ventas:</strong> ${escapeHtml(money(format.totals.amount))}</p>`
  if (formatId === 'inventory') return `<p><strong>Total cargado:</strong> ${escapeHtml(format.totals.loaded)}</p>`
  if (formatId === 'scrap') return `<p><strong>Total merma:</strong> ${escapeHtml(format.totals.scrap)}</p>`
  if (formatId === 'corte') {
    return `<p><strong>Totales:</strong> Cargado ${escapeHtml(format.totals.loaded)} · Entregado ${escapeHtml(format.totals.delivered)} · Devuelto ${escapeHtml(format.totals.returned)} · Merma ${escapeHtml(format.totals.scrap)} · Diferencia ${escapeHtml(format.totals.difference)}</p>`
  }
  if (formatId === 'liquidation') {
    return `<p><strong>Esperado:</strong> ${escapeHtml(money(format.totals.expected))} · <strong>Cobrado:</strong> ${escapeHtml(money(format.totals.collected))} · <strong>Diferencia:</strong> ${escapeHtml(money(format.totals.difference))}</p>`
  }
  return ''
}

export function buildRouteFormatHtml(viewModel, formatId) {
  const vm = viewModel || buildRouteFormatsViewModel({})
  const title = getFormatTitle(formatId)
  const content = formatRows(vm, formatId)
  const body = Array.isArray(content)
    ? `<p class="empty">${escapeHtml(content[0]?.[0] || 'Sin datos')}</p>`
    : content

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} - ${escapeHtml(vm.plan.name)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
    header { border-bottom: 2px solid #111827; margin-bottom: 18px; padding-bottom: 12px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .meta { color: #4b5563; font-size: 12px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th, td { border: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; text-align: left; }
    th { background: #f3f4f6; font-weight: 700; }
    .totals { margin-top: 14px; font-size: 13px; }
    .empty { padding: 14px; border: 1px dashed #d1d5db; color: #6b7280; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <div><strong>Plan:</strong> ${escapeHtml(vm.plan.name)}</div>
      <div><strong>Ruta:</strong> ${escapeHtml(vm.plan.routeName)} · <strong>Chofer:</strong> ${escapeHtml(vm.plan.driverName)}</div>
      <div><strong>Unidad:</strong> ${escapeHtml(vm.plan.vehicleName || '-')} · <strong>Fecha:</strong> ${escapeHtml(vm.plan.date || '-')}</div>
    </div>
  </header>
  ${body}
  <div class="totals">${formatTotals(vm, formatId)}</div>
</body>
</html>`
}

export function formatRouteMoney(value) {
  return money(value)
}
