export const ROUTE_FORMATS = [
  { id: 'summary', label: 'Resumen 1 hoja' },
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

function firstNumber(...values) {
  for (const value of values) {
    if (value == null || value === false || value === '') continue
    return number(value)
  }
  return 0
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

function slug(value) {
  return text(value || 'reporte')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function normalizePlan(detail = {}) {
  const plan = detail.plan && typeof detail.plan === 'object' ? detail.plan : {}
  const state = text(detail.state || plan.state || detail.plan_state).toLowerCase()
  return {
    id: detail.id || plan.id || detail.plan_id || plan.plan_id || '',
    name: text(detail.name || plan.name || detail.plan_name || (detail.id ? `Plan #${detail.id}` : 'Plan de ruta')),
    routeName: text(detail.route_name || plan.route_name || detail.route || detail.route_id, 'Ruta'),
    driverName: text(detail.driver_name || plan.driver_name || detail.driver || detail.salesperson_name || detail.salesperson, 'Chofer'),
    vehicleName: text(detail.vehicle_name || plan.vehicle_name || detail.vehicle || detail.vehicle_id, ''),
    date: text(detail.date || plan.date || detail.route_date || detail.closed_date || detail.validated_date, ''),
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

function rawReloads(detail = {}) {
  const candidates = [
    detail.reload_lines,
    detail.reloads,
    detail.refill_lines,
    detail.refills,
    detail.restock_lines,
    detail.restocks,
  ]
  return candidates.find(Array.isArray) || []
}

function rawVisitRows(detail = {}) {
  const candidates = [
    detail.stops,
    detail.stop_ids,
    detail.visit_lines,
    detail.visits,
    detail.route_stops,
    detail.planned_visits_lines,
  ]
  const rows = candidates.find(Array.isArray) || []
  return rows.filter((row) => row && typeof row === 'object')
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

function normalizeReload(row = {}) {
  const product = text(row.product_name || row.product || row.product_id, 'Producto')
  const quantity = firstNumber(row.qty_loaded, row.loaded, row.quantity, row.qty, row.product_uom_qty)

  return {
    id: row.id || `${product}-${quantity}-${text(row.name || row.folio || row.reference)}`,
    product,
    quantity,
    folio: text(row.folio || row.name || row.reference || row.move_name, 'Recarga'),
    time: text(row.time || row.date || row.create_date || row.scheduled_date, ''),
  }
}

function shortTime(value) {
  const raw = text(value)
  const match = raw.match(/(\d{1,2}):(\d{2})/)
  if (!match) return raw
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function isVisitedStop(row = {}) {
  const status = text(row.result_status || row.status || row.state).toLowerCase()
  if (row.actual_start_time || row.start_time || row.visit_time || row.visited_at || row.actual_end_time) return true
  if (status.includes('not_visited') || status.includes('no visit') || status.includes('skipped')) return false
  return status.includes('visited') || status.includes('done') || status.includes('completed')
}

function normalizeVisitRow(row = {}) {
  const customerId = row.customer_id?.[0] || row.customer_id || row.partner_id?.[0] || row.partner_id || ''
  const visited = isVisitedStop(row)
  const visitTime = shortTime(row.actual_start_time || row.start_time || row.visit_time || row.visited_at || row.actual_end_time)
  const hasSale = row.has_sale != null
    ? Boolean(row.has_sale)
    : firstNumber(row.sale_order_count, row.sales_count, row.sales_amount) > 0
  const saleStatus = hasSale ? 'Venta' : 'No venta'

  return {
    id: row.id || customerId || text(row.customer_name || row.customer || row.partner_name),
    sequence: firstNumber(row.sequence, row.stop_sequence, row.order),
    customer: text(
      row.customer_name || row.partner_name || row.customer || row.partner || row.customer_id || row.partner_id,
      customerId ? `Cliente #${customerId}` : 'Cliente',
    ),
    plannedTime: shortTime(row.planned_time || row.scheduled_time || row.expected_time || row.time_window || row.window || ''),
    visitTime: visited ? visitTime : '',
    status: visited ? 'Visitado' : 'Sin visita',
    saleStatus,
  }
}

function normalizeVisitList(detail = {}) {
  const rows = rawVisitRows(detail)
    .map(normalizeVisitRow)
    .sort((a, b) => {
      if (a.sequence !== b.sequence) return a.sequence - b.sequence
      return a.customer.localeCompare(b.customer, 'es')
    })

  return {
    rows,
    totals: {
      planned: rows.length,
      visited: rows.filter((row) => row.visitTime).length,
    },
    empty: rows.length === 0,
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

function sumReloadsByProduct(reloads) {
  return reloads.reduce((totals, reload) => {
    totals[reload.product] = number(totals[reload.product]) + number(reload.quantity)
    return totals
  }, {})
}

function normalizeVisits(detail = {}) {
  const summary = detail.summary || detail.liquidation_summary || {}
  const planned = firstNumber(
    detail.visits_planned,
    detail.planned_visits,
    detail.stops_total,
    detail.total_stops,
    detail.visit_count,
    summary.visits_planned,
    summary.planned_visits,
    summary.stops_total,
    summary.total_stops,
  )
  const done = firstNumber(
    detail.visits_done,
    detail.done_visits,
    detail.stops_done,
    detail.completed_stops,
    detail.visited_count,
    summary.visits_done,
    summary.done_visits,
    summary.stops_done,
    summary.completed_stops,
  )
  const notDone = Math.max(firstNumber(
    detail.visits_not_done,
    detail.not_done_visits,
    detail.not_visited_count,
    summary.visits_not_done,
    summary.not_done_visits,
    summary.not_visited_count,
    planned - done,
  ), 0)

  return {
    planned,
    done,
    notDone,
    compliancePct: planned > 0 ? Math.round((done / planned) * 100) : 0,
  }
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
  const expectedBuckets = summary.expected_payments || {}
  const paymentBuckets = summary.payments || {}
  const rows = normalizePaymentEntries(summary)
  const expectedCash = firstNumber(expectedBuckets.cash?.total, expectedBuckets.cash, summary.total_expected)
  const expectedCredit = firstNumber(expectedBuckets.credit?.total, expectedBuckets.credit)
  const expectedTransfer = firstNumber(expectedBuckets.transfer?.total, expectedBuckets.transfer)
  const hasExplicitCashReceived = [
    detail.cash_received_amount,
    detail.plan?.cash_received_amount,
  ].some((value) => value != null && value !== false && value !== '')
  const receivedCash = hasExplicitCashReceived
    ? firstNumber(
      detail.cash_received_amount,
      detail.plan?.cash_received_amount,
    )
    : expectedCash
  const receivedTransfer = firstNumber(
    paymentBuckets.transfer?.total,
    summary.by_method?.transfer,
  )
  const expected = number(summary.total_expected ?? summary.expected_total ?? (expectedCash + expectedCredit + expectedTransfer))
  const collected = number(summary.total_collected ?? summary.collected_total ?? rows.reduce((sum, row) => sum + row.amount, 0))
  const difference = number(expected - expectedCredit - expectedCash)

  return {
    rows,
    totals: {
      expected,
      collected,
      difference,
      credit: expectedCredit,
      cashExpected: expectedCash,
      cashReceived: receivedCash,
      transfer: expectedTransfer,
      transferReceived: receivedTransfer,
    },
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
  const kilos = number(
    row.kg_total
    ?? (Array.isArray(row.lines)
      ? row.lines.reduce((sum, line) => sum + number(line.kg_total ?? ((line.weight || 0) * (line.quantity || 0))), 0)
      : 0),
  )

  return {
    id: row.id || folio,
    folio,
    customer,
    method,
    amount,
    kilos,
  }
}

function normalizeSales(detail = {}) {
  const rows = rawSales(detail).map(normalizeSale)
  const byMethod = rows.reduce((acc, row) => {
    const key = text(row.method).toLowerCase() || 'cash'
    acc[key] = number(acc[key]) + number(row.amount)
    return acc
  }, {})
  return {
    rows,
    totals: {
      amount: rows.reduce((sum, row) => sum + row.amount, 0),
      kilos: rows.reduce((sum, row) => sum + row.kilos, 0),
      byMethod,
    },
    unavailable: rows.length === 0,
  }
}

function buildSummary({ detail, lines, lineTotals, reloads, sales, liquidation }) {
  const reloadTotalsByProduct = sumReloadsByProduct(reloads)
  const totalReloaded = reloads.reduce((sum, row) => sum + number(row.quantity), 0)

  return {
    visits: normalizeVisits(detail),
    sales: {
      total: sales.totals.amount,
      count: sales.rows.length,
      kilos: sales.totals.kilos,
      credit: liquidation.totals.credit,
      cash: liquidation.totals.cashExpected,
      cashReceived: liquidation.totals.cashReceived,
      unavailable: sales.unavailable,
    },
    visitList: normalizeVisitList(detail),
    inventory: {
      rows: lines.map((line) => ({
        id: line.id,
        product: line.product,
        loaded: line.loaded,
        delivered: line.delivered,
        returned: line.returned,
        scrap: line.scrap,
        difference: line.difference,
      })),
      totals: {
        loaded: lineTotals.loaded,
        delivered: lineTotals.delivered,
        returned: lineTotals.returned,
        scrap: lineTotals.scrap,
        difference: lineTotals.difference,
      },
      empty: lines.length === 0,
    },
    reloads: {
      rows: reloads,
      totals: { quantity: totalReloaded, count: reloads.length },
      empty: reloads.length === 0,
    },
    liquidation,
  }
}

function buildFormats(detail = {}) {
  const lines = rawLines(detail).map(normalizeLine)
  const reloads = rawReloads(detail).map(normalizeReload)
  const lineTotals = sumLines(lines)
  const scrapRows = lines.filter((line) => line.scrap > 0)
  const sales = normalizeSales(detail)
  const liquidation = normalizeLiquidation(detail)

  return {
    summary: buildSummary({ detail, lines, lineTotals, reloads, sales, liquidation }),
    sales,
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
    liquidation,
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

function metricGrid(metrics) {
  return `<div class="metrics">${metrics.map((metric) => `
    <div class="metric">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(metric.value)}</strong>
    </div>
  `).join('')}</div>`
}

function formatSummaryRows(format) {
  const inventoryTable = format.inventory.empty
    ? '<p class="empty">Sin inventario disponible.</p>'
    : table(
      ['Producto', 'Cargado', 'Vendido', 'Devuelto', 'Merma', 'Dif.'],
      format.inventory.rows.map((row) => [
        row.product,
        row.loaded,
        row.delivered,
        row.returned,
        row.scrap,
        row.difference,
      ]),
    )
  const reloadTable = format.reloads.empty
    ? '<p class="empty">Sin cargas registradas.</p>'
    : table(
      ['Folio', 'Producto', 'Cant.', 'Hora'],
      format.reloads.rows.map((row) => [row.folio, row.product, row.quantity, row.time || '-']),
    )
  const visitTable = format.visitList.empty
    ? '<p class="empty">Sin lista de visitas disponible.</p>'
    : table(
      ['#', 'Cliente planeado', 'Hora plan', 'Hora visita', 'Estado', 'Venta'],
      format.visitList.rows.map((row) => [
        row.sequence || '-',
        row.customer,
        row.plannedTime || '-',
        row.visitTime || '-',
        row.status,
        row.saleStatus,
      ]),
    )

  return `
    <section class="hero-card">
      <div>
        <p class="eyebrow">Resumen operativo</p>
        <h2 class="hero-title">Corte y liquidacion de ruta</h2>
        <p class="hero-copy">Resumen consolidado de visitas, inventario, cargas y liquidacion del repartidor.</p>
      </div>
    </section>
    ${metricGrid([
      { label: 'Visitas planificadas', value: format.visits.planned },
      { label: 'Visitas realizadas', value: format.visits.done },
      { label: 'No realizadas', value: format.visits.notDone },
      { label: 'Cumplimiento', value: `${format.visits.compliancePct}%` },
      { label: 'Total ventas', value: format.sales.unavailable ? 'N/D' : money(format.sales.total) },
      { label: 'Ventas', value: format.sales.unavailable ? 'N/D' : format.sales.count },
      { label: 'Kilos vendidos', value: format.sales.unavailable ? 'N/D' : `${format.sales.kilos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` },
      { label: 'Credito', value: money(format.liquidation.totals.credit) },
      { label: 'Cash / efectivo', value: money(format.liquidation.totals.cashExpected) },
      { label: 'Diferencia', value: money(format.liquidation.totals.difference) },
    ])}
    <h2>Lista de visitas</h2>
    ${visitTable}
    <h2>Inventario y corte</h2>
    ${inventoryTable}
    <h2>Cargas</h2>
    ${reloadTable}
    <h2>Liquidacion</h2>
    ${table(
      ['Credito', 'Cash esperado', 'Cash recibido', 'Diferencia'],
      [[
        money(format.liquidation.totals.credit),
        money(format.liquidation.totals.cashExpected),
        money(format.liquidation.totals.cashReceived),
        money(format.liquidation.totals.difference),
      ]],
    )}
  `
}

function formatRows(vm, formatId) {
  const format = vm.formats[formatId]
  if (!format) return [['Sin datos']]

  if (formatId === 'summary') {
    return formatSummaryRows(format)
  }

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
    return `<p><strong>Crédito:</strong> ${escapeHtml(money(format.totals.credit))} · <strong>Cash esperado:</strong> ${escapeHtml(money(format.totals.cashExpected))} · <strong>Cash recibido:</strong> ${escapeHtml(money(format.totals.cashReceived))} · <strong>Diferencia:</strong> ${escapeHtml(money(format.totals.difference))}</p>`
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
    @page { size: letter; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #14213d; margin: 0; font-size: 11px; background: #f4f7fb; }
    .report-shell { background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); border: 1px solid #d8e2f0; border-radius: 18px; padding: 20px; }
    header { margin-bottom: 18px; padding: 18px; border: 1px solid #dbe5f2; border-radius: 16px; background: linear-gradient(135deg, #f8fbff 0%, #edf4ff 100%); }
    .header-top { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    h1 { font-size: 22px; margin: 4px 0 8px; }
    h2 { font-size: 12px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #5c6f82; }
    .eyebrow { margin: 0; color: #5c6f82; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; }
    .meta { color: #516173; font-size: 11px; line-height: 1.6; }
    .meta-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; margin-top: 12px; }
    .meta-card { padding: 12px 14px; background: #fff; border: 1px solid #dbe5f2; border-radius: 14px; }
    .meta-label { display: block; color: #6b7c8f; font-size: 9px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
    .report-chip { padding: 8px 12px; border-radius: 999px; background: #143d73; color: white; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
    .hero-card { padding: 14px 16px; border: 1px solid #dbe5f2; border-radius: 16px; background: #ffffff; margin-bottom: 14px; }
    .hero-title { font-size: 18px; margin: 4px 0 6px; }
    .hero-copy { margin: 0; color: #617386; font-size: 11px; }
    .metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 12px 0 18px; }
    .metric { border: 1px solid #dbe5f2; border-radius: 14px; padding: 10px; background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%); min-height: 68px; }
    .metric span { display: block; color: #6b7c8f; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
    .metric strong { display: block; margin-top: 6px; font-size: 16px; line-height: 1.2; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 6px; border: 1px solid #dbe5f2; border-radius: 14px; overflow: hidden; }
    th, td { padding: 8px 10px; font-size: 10px; text-align: left; }
    th { background: #eef4fb; color: #607386; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #dbe5f2; }
    td { border-bottom: 1px solid #ebf1f8; }
    tbody tr:nth-child(even) td { background: #fbfdff; }
    tbody tr:last-child td { border-bottom: none; }
    .totals { margin-top: 16px; font-size: 12px; color: #243447; padding: 12px 14px; background: #fff; border: 1px solid #dbe5f2; border-radius: 14px; }
    .empty { padding: 16px; border: 1px dashed #c9d6e6; color: #6b7c8f; background: #fbfdff; border-radius: 14px; }
  </style>
</head>
<body>
  <div class="report-shell">
  <header>
    <div class="header-top">
      <div>
        <p class="eyebrow">Liquidaciones de ruta</p>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <div class="report-chip">Corte y liquidacion</div>
    </div>
    <div class="meta-card meta">
      <div><strong>Plan:</strong> ${escapeHtml(vm.plan.name)}</div>
      <div><strong>Ruta:</strong> ${escapeHtml(vm.plan.routeName)} · <strong>Chofer:</strong> ${escapeHtml(vm.plan.driverName)}</div>
      <div><strong>Unidad:</strong> ${escapeHtml(vm.plan.vehicleName || '-')} · <strong>Fecha:</strong> ${escapeHtml(vm.plan.date || '-')}</div>
    </div>
    <div class="meta-card">
      <span class="meta-label">Resumen del reparto</span>
      <div class="meta">Chofer: ${escapeHtml(vm.plan.driverName)}<br>Unidad: ${escapeHtml(vm.plan.vehicleName || '-')}<br>Fecha: ${escapeHtml(vm.plan.date || '-')}</div>
    </div>
  </header>
  ${body}
  <div class="totals">${formatTotals(vm, formatId)}</div>
  </div>
</body>
</html>`
}

export function formatRouteMoney(value) {
  return money(value)
}

export function buildRouteDownloadName(viewModel, formatId) {
  const vm = viewModel || buildRouteFormatsViewModel({})
  if (formatId === 'summary') {
    return `${slug('Corte y liquidacion')}-${slug(vm.plan.driverName)}-${slug(vm.plan.name)}.pdf`
  }
  return `${slug(getFormatTitle(formatId))}-${slug(vm.plan.driverName)}-${slug(vm.plan.name)}.pdf`
}

export function openRouteFormatPrintWindow(
  viewModel,
  formatId,
  browserWindow = globalThis.window,
  htmlBuilder = buildRouteFormatHtml,
) {
  const printWindow = browserWindow?.open?.('', '_blank')
  if (!printWindow) throw new Error('El navegador bloqueo la ventana de descarga')

  const html = htmlBuilder(viewModel, formatId)
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.document.title = buildRouteDownloadName(viewModel, formatId)
  printWindow.focus()
  browserWindow.setTimeout(() => {
    printWindow.print()
  }, 350)
}
