const EXPENSE_MODULES = new Set(['gastos', 'gastos-hist', 'gastos-aprobar'])
const SALE_MODULES = new Set(['pos'])
const TRANSFER_MODULES = new Set(['traspaso-mp'])

const TRANSFER_STATE_LABELS = {
  draft: 'Borrador',
  confirmed: 'Confirmado',
  issued: 'Entregado',
  reported: 'Reportado',
  validated: 'Validado',
  rejected: 'Rechazado',
  disputed: 'En disputa',
  force_closed: 'Cerrado forzado',
  abandoned: 'Abandonado',
  consumed: 'Consumido',
}

function toMillis(value) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeSaleEvents(sales = []) {
  return sales.map((sale) => ({
    id: `sale-${sale.id}`,
    type: 'sale',
    label: sale.name || `Venta ${sale.id}`,
    amount: Number(sale.amount_total ?? sale.total ?? 0),
    at: sale.date_order || sale.create_date || null,
    meta: sale.partner_id?.[1] || sale.partner_name || sale.customer || '',
  }))
}

function normalizeExpenseEvents(expenses = []) {
  return expenses.map((expense) => ({
    id: `exp-${expense.id}`,
    type: 'expense',
    label: expense.name || expense.description || 'Gasto',
    amount: Number(expense.total_amount ?? expense.amount ?? 0),
    at: expense.date || expense.create_date || null,
    meta: expense.payment_mode === 'own_account' ? 'Pago empleado' : 'Pago empresa',
  }))
}

function normalizeTransferEvents(transfers = []) {
  return transfers.map((transfer) => {
    const qty = Number(transfer.qty_issued ?? transfer.qty ?? 0)
    const uom = String(transfer.uom || transfer.uom_name || 'Units').trim() || 'Units'
    const state = String(transfer.state || '').trim()
    const stateLabel = TRANSFER_STATE_LABELS[state] || state || 'Registrado'
    const actor = transfer.issued_by_name || transfer.line_name || ''

    return {
      id: `transfer-${transfer.id}`,
      type: 'transfer',
      label: transfer.material_name || transfer.name || `Traspaso ${transfer.id}`,
      amount: qty,
      at: transfer.create_date || transfer.write_date || null,
      meta: actor ? `${stateLabel} · ${actor}` : stateLabel,
      valueLabel: `${qty.toFixed(qty % 1 === 0 ? 0 : 2)} ${uom}`,
    }
  })
}

export function resolveActivityFeedScope(moduleId) {
  if (EXPENSE_MODULES.has(moduleId)) {
    return { sales: false, expenses: true, transfers: false }
  }
  if (SALE_MODULES.has(moduleId)) {
    return { sales: true, expenses: false, transfers: false }
  }
  if (TRANSFER_MODULES.has(moduleId)) {
    return { sales: false, expenses: false, transfers: true }
  }
  return { sales: true, expenses: true, transfers: false }
}

export function buildModuleActivityFeed(moduleId, {
  sales = [],
  expenses = [],
  transfers = [],
} = {}) {
  const scope = resolveActivityFeedScope(moduleId)
  const events = [
    ...(scope.sales ? normalizeSaleEvents(sales) : []),
    ...(scope.expenses ? normalizeExpenseEvents(expenses) : []),
    ...(scope.transfers ? normalizeTransferEvents(transfers) : []),
  ]

  events.sort((left, right) => toMillis(right.at) - toMillis(left.at))
  return events.slice(0, 40)
}
