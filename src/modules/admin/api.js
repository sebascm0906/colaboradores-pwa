// ─── API Admin Sucursal — POS, Gastos, Requisiciones ─────────────────────────
// Endpoints del módulo Odoo `gf_pwa_admin` (Sebastián, rollout 2026-04-10).
import { api } from '../../lib/api'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toQuery(filters = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === '') continue
    q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

// ── POS Mostrador ────────────────────────────────────────────────────────────

/** Productos disponibles con stock en el CEDIS del empleado */
export function getPosProducts(warehouseId) {
  return api('GET', `/pwa-admin/pos-products?warehouse_id=${warehouseId}`)
}

/** Buscar clientes (para factura) */
export function searchCustomers(query) {
  return api('GET', `/pwa-admin/customers?q=${encodeURIComponent(query)}`)
}

/** Cliente default "Publico Mostrador" de la sucursal */
export function getDefaultCustomer() {
  return api('GET', '/pwa-admin/default-customer')
}

/** Crear venta (sale.order + confirmar) */
export function createSaleOrder(data) {
  return api('POST', '/pwa-admin/sale-create', data)
}

/** Ver detalle de un ticket/venta */
export function getSaleOrder(orderId) {
  return api('GET', `/pwa-admin/sale-detail?order_id=${orderId}`)
}

/** Cancela una venta (sale.order.action_cancel). Revierte stock moves.
 *  Rechaza si la venta ya está `done`. La razón queda en el chatter. */
export function cancelSaleOrder(orderId, reason) {
  return api('POST', '/pwa-admin/sale-cancel', {
    order_id: orderId,
    reason: reason || '',
  })
}

/** Ventas del día. Acepta { warehouseId, companyId } o un número legacy. */
export function getTodaySales(arg) {
  if (typeof arg === 'number' || typeof arg === 'string') {
    return api('GET', `/pwa-admin/today-sales?warehouse_id=${arg}`)
  }
  const { warehouseId, companyId } = arg || {}
  const qs = toQuery({ warehouse_id: warehouseId, company_id: companyId })
  return api('GET', `/pwa-admin/today-sales${qs}`)
}

// ── Validación de ticket (Almacenista Entregas) ──────────────────────────────

/** Buscar ticket por folio */
export function findTicket(folio) {
  return api('GET', `/pwa-admin/find-ticket?folio=${encodeURIComponent(folio)}`)
}

/** Confirmar despacho de ticket → descuenta inventario */
export function dispatchTicket(orderId) {
  return api('POST', '/pwa-admin/dispatch-ticket', { order_id: orderId })
}

/** Tickets pendientes de despacho */
export function getPendingTickets(warehouseId) {
  return api('GET', `/pwa-admin/pending-tickets?warehouse_id=${warehouseId}`)
}

// ── Gastos ────────────────────────────────────────────────────────────────────

/** Registrar gasto (`hr.expense`). Payload completo soportado por
 *  gf_pwa_admin.expense-create: ver docs de Sebastián 2026-04-10. */
export function createExpense(data) {
  return api('POST', '/pwa-admin/expense-create', data)
}

/** Gastos del día. Acepta filtros { companyId, warehouseId }. */
export function getTodayExpenses(filters = {}) {
  const { companyId, warehouseId } = filters
  const qs = toQuery({ company_id: companyId, warehouse_id: warehouseId })
  return api('GET', `/pwa-admin/today-expenses${qs}`)
}

/** Adjunta una foto/archivo a un hr.expense. Base64 sin prefix data:. */
export function attachExpense(payload) {
  const { expenseId, filename, base64, mime } = payload || {}
  return api('POST', '/pwa-admin/expense-attach', {
    expense_id: expenseId,
    filename,
    base64,
    mime,
  })
}

/** Lista los adjuntos de un gasto. */
export function getExpenseAttachments(expenseId) {
  return api('GET', `/pwa-admin/expense-attachments?expense_id=${expenseId}`)
}

/** Historial de gastos con filtros:
 *    company_id, warehouse_id, employee_id, date_from, date_to,
 *    state, limit, offset */
export function getExpensesHistory(filters = {}) {
  const mapped = {
    company_id: filters.companyId ?? filters.company_id,
    warehouse_id: filters.warehouseId ?? filters.warehouse_id,
    employee_id: filters.employeeId ?? filters.employee_id,
    date_from: filters.dateFrom ?? filters.date_from,
    date_to: filters.dateTo ?? filters.date_to,
    state: filters.state,
    limit: filters.limit,
    offset: filters.offset,
  }
  return api('GET', `/pwa-admin/expenses-history${toQuery(mapped)}`)
}

// ── Analítica (Odoo 18 — analytic_distribution) ──────────────────────────────

/** Cuentas analíticas filtradas por razón social (company_id).
 *  Devuelve { ok, data: { company_id, count, accounts: [...] } }. */
export function getAnalyticAccounts(companyId) {
  return api('GET', `/pwa-admin/analytic-accounts?company_id=${companyId}`)
}

/** Feature flags del backend (leídos al boot por AdminProvider). */
export function getCapabilities() {
  return api('GET', '/pwa-admin/capabilities')
}

// ── Requisiciones ────────────────────────────────────────────────────────────

/** Crear requisición (purchase.order draft con analytic_distribution) */
export function createRequisition(data) {
  return api('POST', '/pwa-admin/requisition-create', data)
}

/** Requisiciones recientes. Acepta filtros {companyId, state, dateFrom, dateTo, limit, offset}. */
export function getRequisitions(filters = {}) {
  const mapped = {
    company_id: filters.companyId ?? filters.company_id,
    state: filters.state,
    date_from: filters.dateFrom ?? filters.date_from,
    date_to: filters.dateTo ?? filters.date_to,
    limit: filters.limit,
    offset: filters.offset,
  }
  const qs = toQuery(mapped)
  return api('GET', `/pwa-admin/requisitions${qs}`)
}

/** Detalle de requisición con líneas. */
export function getRequisitionDetail(id) {
  return api('GET', `/pwa-admin/requisition-detail?id=${id}`)
}

/** Cancela una requisición en draft/sent. Rechaza si está confirmada. */
export function cancelRequisition(id) {
  return api('POST', '/pwa-admin/requisition-cancel', { id })
}

/** Aprueba una requisición pendiente (requiere rol gerente/director). */
export function approveRequisition(id) {
  return api('POST', '/pwa-admin/requisition-approve', { id })
}

/** Rechaza una requisición pendiente o aprobada con motivo obligatorio. */
export function rejectRequisition(id, reason) {
  return api('POST', '/pwa-admin/requisition-reject', { id, reason })
}

// ── Cierre de Caja ───────────────────────────────────────────────────────────

/** Resumen del día (ventas, gastos, neto) — read-only */
export function getCashClosing(filters = {}) {
  const { companyId, warehouseId } = filters
  const qs = toQuery({ company_id: companyId, warehouse_id: warehouseId })
  return api('GET', `/pwa-admin/cash-closing${qs}`)
}

/** Cierre formal del día (arqueo con denominaciones). Sprint 3.
 *  Payload:
 *    { company_id, warehouse_id, opening_fund,
 *      denominations: [{denomination, count}, ...],
 *      other_income, other_expense, notes, close }
 *  `sales_total` y `expenses_total` los computa el backend. */
export function createCashClosing(data) {
  return api('POST', '/pwa-admin/cash-closing', data)
}

/** Historial de cierres (gf.cash.closing) con paginación y filtros. */
export function getCashClosingHistory(filters = {}) {
  const mapped = {
    company_id: filters.companyId ?? filters.company_id,
    warehouse_id: filters.warehouseId ?? filters.warehouse_id,
    date_from: filters.dateFrom ?? filters.date_from,
    date_to: filters.dateTo ?? filters.date_to,
    state: filters.state,
    limit: filters.limit,
    offset: filters.offset,
  }
  return api('GET', `/pwa-admin/cash-closing/history${toQuery(mapped)}`)
}

/** Detalle de un cierre específico (denominaciones + diferencia + notas). */
export function getCashClosingDetail(id) {
  return api('GET', `/pwa-admin/cash-closing/detail?id=${id}`)
}

// ── Liquidaciones (wrappers gf_logistics_ops) ───────────────────────────────

/** Planes de ruta cerrados pendientes de validación. */
export function getPendingLiquidations(filters = {}) {
  const { companyId, warehouseId } = filters
  const qs = toQuery({ company_id: companyId, warehouse_id: warehouseId })
  return api('GET', `/pwa-admin/liquidaciones/pending${qs}`)
}

/** Detalle del plan con build_liquidation_summary() + reconciliation lines. */
export function getLiquidationDetail(planId) {
  return api('GET', `/pwa-admin/liquidaciones/detail?plan_id=${planId}`)
}

/** Valida la conciliación → marca reconciliation como done. */
export function validateLiquidation(planId) {
  return api('POST', '/pwa-admin/liquidaciones/validate', { plan_id: planId })
}

/** Historial de liquidaciones validadas (reconciliation state=done). */
export function getLiquidationsHistory(filters = {}) {
  const mapped = {
    company_id: filters.companyId ?? filters.company_id,
    warehouse_id: filters.warehouseId ?? filters.warehouse_id,
    date_from: filters.dateFrom ?? filters.date_from,
    date_to: filters.dateTo ?? filters.date_to,
    limit: filters.limit,
    offset: filters.offset,
  }
  return api('GET', `/pwa-admin/liquidaciones/history${toQuery(mapped)}`)
}

// ── Materia Prima ────────────────────────────────────────────────────────────

/** Inventario de MP (stock.quant) por warehouse/company. */
export function getMpStock(filters = {}) {
  const { companyId, warehouseId } = filters
  const qs = toQuery({ company_id: companyId, warehouse_id: warehouseId })
  return api('GET', `/pwa-admin/materia-prima/stock${qs}`)
}

/** Recepciones del día (stock.picking incoming). */
export function getMpReceipts(filters = {}) {
  const { companyId, warehouseId } = filters
  const qs = toQuery({ company_id: companyId, warehouse_id: warehouseId })
  return api('GET', `/pwa-admin/materia-prima/receipts${qs}`)
}

/** Consumos del día (gf.transformation.order). */
export function getMpConsumption(filters = {}) {
  const { companyId } = filters
  const qs = toQuery({ company_id: companyId })
  return api('GET', `/pwa-admin/materia-prima/consumption${qs}`)
}

/** Kardex: stock.move done para un producto específico con filtros de fecha. */
export function getMpMoves(filters = {}) {
  const mapped = {
    product_id: filters.productId ?? filters.product_id,
    company_id: filters.companyId ?? filters.company_id,
    warehouse_id: filters.warehouseId ?? filters.warehouse_id,
    date_from: filters.dateFrom ?? filters.date_from,
    date_to: filters.dateTo ?? filters.date_to,
    limit: filters.limit,
  }
  return api('GET', `/pwa-admin/materia-prima/moves${toQuery(mapped)}`)
}

// ── Búsqueda de productos server-side ───────────────────────────────────────

/** Búsqueda real de productos por nombre/SKU/barcode. Reemplaza el
 *  fetch bulk de getPosProducts cuando BACKEND_CAPS.productSearch = true. */
export function searchProducts(filters = {}) {
  const { q, scope, limit, categId } = filters
  const qs = toQuery({ q, scope, limit, categ_id: categId })
  return api('GET', `/pwa-admin/products/search${qs}`)
}

// ── Aprobación de gastos (B2 — 2026-04-18) ──────────────────────────────────

/** Lista de gastos pendientes de aprobación (solo ve gerente/director).
 *  Backend: GET /pwa-admin/expenses-pending-approval?company_id=&limit=&offset=
 *  Retorna hr.expense con x_approval_state='pending' del company_id. */
export function getExpensesPendingApproval(filters = {}) {
  const mapped = {
    company_id:   filters.companyId   ?? filters.company_id,
    warehouse_id: filters.warehouseId ?? filters.warehouse_id,
    limit:        filters.limit,
    offset:       filters.offset,
  }
  return api('GET', `/pwa-admin/expenses-pending-approval${toQuery(mapped)}`)
}

/** Aprueba un gasto pendiente. Backend registra al aprobador en chatter. */
export function approveExpense(expenseId) {
  return api('POST', '/pwa-admin/expense-approve', { expense_id: Number(expenseId) })
}

/** Rechaza un gasto con motivo. Guardado en x_rejection_reason + chatter. */
export function rejectExpense(expenseId, reason) {
  return api('POST', '/pwa-admin/expense-reject', {
    expense_id: Number(expenseId),
    reason: String(reason || '').trim(),
  })
}

// ── Torres de Control — Validación de Requisiciones (2026-04-24) ────────────

/** Lista de requisiciones draft/sent disponibles para el Operador Torre. */
export function getTorreRequisitions(filters = {}) {
  const mapped = {
    company_id: filters.companyId ?? filters.company_id,
  }
  return api('GET', `/pwa-admin/torre/requisitions${toQuery(mapped)}`)
}

/** Detalle de una requisición con sus líneas (para el formulario de validación). */
export function getTorreRequisitionDetail(id) {
  return api('GET', `/pwa-admin/torre/requisition-detail?id=${id}`)
}

/** Actualiza líneas: price_unit y/o analytic_distribution. */
export function updateTorreRequisitionLines(poId, lines) {
  return api('POST', '/pwa-admin/torre/requisition-update', { id: poId, lines })
}

/** Confirma la requisición → purchase.order confirmado + approval_state='approved'. */
export function confirmTorreRequisition(id) {
  return api('POST', '/pwa-admin/torre/requisition-confirm', { id })
}

/** Cuentas analíticas del plan "PL" (Plazas) para distribuir por línea. */
export function getTorrePlazas(companyId) {
  const qs = companyId ? `?company_id=${companyId}` : ''
  return api('GET', `/pwa-admin/torre/plazas${qs}`)
}

// ── Clientes (supv) — Inactivos y Recuperación (A3) ─────────────────────────

/** Clientes sin orden en los últimos N días (backend: 60 por default). */
export function getInactiveCustomers(filters = {}) {
  const mapped = {
    company_id: filters.companyId ?? filters.company_id,
    limit:      filters.limit,
    offset:     filters.offset,
  }
  return api('GET', `/pwa-supv/customers/inactive${toQuery(mapped)}`)
}

/** Clientes marcados needs_recovery_plan=true por el backend. */
export function getRecoveryCustomers(filters = {}) {
  const mapped = {
    company_id: filters.companyId ?? filters.company_id,
    limit:      filters.limit,
    offset:     filters.offset,
  }
  return api('GET', `/pwa-supv/customers/recovery${toQuery(mapped)}`)
}

// ── Requisition receipt ───────────────────────────────────────────────────────

/** Detalle del picking de recepción asociado a una requisición confirmada.
 *  Devuelve: { picking_id, state, lines: [{ move_id, product_name, qty_ordered,
 *    qty_received, qty_pending }] } */
export function getRequisitionReceiptDetail(id) {
  return api('GET', `/pwa-admin/requisition-receipt-detail?id=${id}`)
}

/** Registra recepción parcial o total sobre el picking de Odoo.
 *  Payload: { id: purchase_order_id, lines: [{ move_id, receive_now_qty }] } */
export function receiveRequisitionProducts(data) {
  return api('POST', '/pwa-admin/requisition-receive', data)
}
