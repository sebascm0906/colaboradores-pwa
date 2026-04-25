// ─── adminService — capa de orquestación del rol Auxiliar Administrativo ────
// Wrappea los endpoints crudos de ./api con lógica de negocio, feature flags
// para capacidades del backend, y filtrado multi-company.
//
// IMPORTANTE — feature flags (BACKEND_CAPS):
// Defaults reflejan lo que el módulo `gf_pwa_admin` ya entrega en Odoo
// (Sebastián, 2026-04-10). Se pueden sobreescribir en runtime llamando
// `applyCapabilities()` con la respuesta de GET /pwa-admin/capabilities.
import {
  getTodaySales,
  getTodayExpenses,
  getExpensesHistory,
  createExpense as apiCreateExpense,
  createRequisition as apiCreateRequisition,
  createCashClosing as apiCreateCashClosing,
  getCapabilities as apiGetCapabilities,
} from './api'

// ── Feature caps del backend ────────────────────────────────────────────────
// Los defaults están en true porque `gf_pwa_admin` ya expone todos estos
// endpoints (Sebastián confirmó rollout 2026-04-10). Aun así, al boot pedimos
// GET /pwa-admin/capabilities para detectar si el módulo aún no está instalado
// en el ambiente actual y caer a modo seguro.
//
// Los umbrales (`*Threshold`, `*DiffNote`, etc.) los lee la UI del backend
// en boot — si llega un valor nuevo, la UI se adapta sin deploy frontend.
export const BACKEND_CAPS = {
  // Acepta analytic_distribution (dict Odoo 18) en expense-create
  expenseAnalytics: true,
  // Acepta analytic_distribution en requisition-create
  requisitionAnalytics: true,
  // Acepta warehouse_id + sucursal_code + employee_id estructurados
  expenseStructuredMeta: true,
  // Endpoints aceptan filtros company_id/warehouse_id server-side
  serverSideCompanyFilter: true,
  // GET /pwa-admin/cash-closing (read-only summary)
  cashClosingRead: true,
  // POST cierre formal — Sprint 3 live
  cashClosingWrite: true,
  // Wrappers /pwa-admin/liquidaciones/* sobre gf_logistics_ops — Sprint 3 live
  liquidaciones: true,
  // Wrappers /pwa-admin/materia-prima/* (stock.quant + picking + transform) — Sprint 3 live
  materiaPrima: true,
  // Búsqueda server-side /pwa-admin/products/search — Sprint 3 live
  productSearch: true,
  // GET /pwa-admin/requisition-detail + POST /requisition-cancel
  requisitionDetail: true,
  // GET /pwa-admin/requisition-receipt-detail + POST /requisition-receive
  requisitionReceipt: true,
  // GET /pwa-admin/cash-closing/history + /detail
  cashClosingHistory: true,
  // POST /pwa-admin/expense-attach + GET /expense-attachments
  expenseAttachments: true,
  // POST /pwa-admin/sale-cancel (action_cancel + chatter reason)
  saleCancel: true,
  // GET /pwa-admin/liquidaciones/history
  liquidacionesHistory: true,
  // GET /pwa-admin/materia-prima/moves (kardex por producto)
  mpKardex: true,

  // ── Sprint 5 (Guía de pruebas 2026-04-18) ────────────────────────────────
  // Flujo de aprobación de gastos (expense-approve/reject + pending list)
  expenseApproval: true,
  // Monto > threshold requiere foto + aprobación
  expenseApprovalThreshold: 1000,
  // Gastos > threshold deben llevar attachment obligatorio
  expenseRequiresAttachment: true,
  // sale-create valida payment_reference si payment_method='card'
  saleCreate: true,
  // Venta > threshold requiere autorización gerente (UI informa; backend decide)
  saleCreateManagerThreshold: 5000,
  // Umbrales cash closing (alineados con backend)
  //   diff > cashClosingDiffNote    → nota obligatoria
  //   diff > cashClosingDiffManager → requiere gerente
  //   diff > cashClosingDiffDirector → requiere director
  cashClosingDiffNote: 0,
  cashClosingDiffManager: 100,
  cashClosingDiffDirector: 1000,
  // Evidencia fotográfica centralizada
  evidenceUpload: true,
  // Tareas y notas persistidas en backend
  tasksEnabled: true,
  notesEnabled: true,
  // Clientes inactivos / recuperación
  inactiveCustomers: true,
  // Catálogo de incidentes de ruta
  teamIncidents: true,
  // Flujo de aprobación de requisiciones (approve/reject por monto)
  requisitionApproval: false,
  // Monto > threshold requiere aprobación de gerente/director
  requisitionApprovalThreshold: 5000,
}

/** Aplica en runtime la respuesta de GET /pwa-admin/capabilities.
 *  Si el backend no conoce un flag, se mantiene el default local. */
export function applyCapabilities(caps) {
  if (!caps || typeof caps !== 'object') return BACKEND_CAPS
  for (const key of Object.keys(BACKEND_CAPS)) {
    if (!Object.prototype.hasOwnProperty.call(caps, key)) continue
    const incoming = caps[key]
    const currentType = typeof BACKEND_CAPS[key]
    // Preservar el tipo del default — los umbrales (Number) y flags (Boolean)
    // ahora conviven en BACKEND_CAPS. Convertir siempre a Boolean rompía los
    // umbrales (ej: cashClosingDiffManager: 100 → true).
    if (currentType === 'number') {
      const n = Number(incoming)
      if (Number.isFinite(n)) BACKEND_CAPS[key] = n
    } else if (currentType === 'string') {
      BACKEND_CAPS[key] = String(incoming)
    } else {
      BACKEND_CAPS[key] = Boolean(incoming)
    }
  }
  return BACKEND_CAPS
}

/** Boot-time fetch. Se llama desde AdminProvider una sola vez. */
export async function bootCapabilities() {
  try {
    const res = await apiGetCapabilities()
    // El módulo devuelve { ok: true, data: {...} } o el dict plano
    const caps = res?.data || res
    return applyCapabilities(caps)
  } catch {
    // Si falla, conservamos los defaults locales.
    return BACKEND_CAPS
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Filtra una lista de registros Odoo por company_id del lado cliente.
 *  Aún con filtros server-side activos, dejamos este safety-net por si
 *  algún endpoint no soporta el filtro. */
export function filterByCompany(items, companyId) {
  if (!Array.isArray(items)) return []
  if (!companyId) return items
  return items.filter(it => {
    const raw = it?.company_id
    if (raw == null) return true
    const id = Array.isArray(raw) ? raw[0] : Number(raw)
    return id === companyId
  })
}

/** Total en pesos de una lista de ventas/gastos. */
export function sumAmount(items, field = 'amount_total') {
  if (!Array.isArray(items)) return 0
  return items.reduce((acc, it) => acc + Number(it?.[field] || 0), 0)
}

/** Normaliza la respuesta de endpoints que envuelven la data en { ok, data }. */
function unwrap(res) {
  if (res && typeof res === 'object' && 'ok' in res && 'data' in res) return res.data
  return res
}

// ── Dashboard (Hub principal) ───────────────────────────────────────────────

/** Trae los datos del dashboard del día filtrados por razón social.
 *  Usa filtros server-side si BACKEND_CAPS.serverSideCompanyFilter = true. */
export async function getDashboardData({ warehouseId, companyId }) {
  const salesArgs = BACKEND_CAPS.serverSideCompanyFilter
    ? { warehouseId, companyId }
    : { warehouseId }
  const expensesArgs = BACKEND_CAPS.serverSideCompanyFilter
    ? { companyId, warehouseId }
    : {}

  const [salesRaw, expensesRaw] = await Promise.all([
    getTodaySales(salesArgs).catch(() => []),
    getTodayExpenses(expensesArgs).catch(() => []),
  ])

  // Safety-net: aún aplicamos filterByCompany por si el endpoint es legacy.
  const sales = filterByCompany(unwrap(salesRaw), companyId)
  const expenses = filterByCompany(unwrap(expensesRaw), companyId)

  const kpis = {
    ventasHoy: { count: sales.length, total: sumAmount(sales, 'amount_total') },
    gastosHoy: { count: expenses.length, total: sumAmount(expenses, 'total_amount') },
    caja:      { count: sales.length, total: sumAmount(sales, 'amount_total') },
    liquidaciones:  { count: 0, total: 0, pendingBackend: !BACKEND_CAPS.liquidaciones },
    requisiciones:  { count: 0, total: 0, pendingBackend: false },
    materiaPrima:   { count: 0, total: 0, pendingBackend: !BACKEND_CAPS.materiaPrima },
    alertas:        { count: 0 },
  }

  return { sales, expenses, kpis }
}

/** Construye un feed cronológico unificado (ventas + gastos). */
export function buildActivityFeed({ sales = [], expenses = [] }) {
  const events = []

  for (const s of sales) {
    events.push({
      id: `sale-${s.id}`,
      type: 'sale',
      label: s.name || `Venta ${s.id}`,
      amount: Number(s.amount_total || 0),
      at: s.date_order || s.create_date || null,
      meta: s.partner_id?.[1] || s.partner_name || '',
    })
  }

  for (const e of expenses) {
    events.push({
      id: `exp-${e.id}`,
      type: 'expense',
      label: e.name || e.description || 'Gasto',
      amount: Number(e.total_amount || e.amount || 0),
      at: e.date || e.create_date || null,
      meta: e.payment_mode === 'own_account' ? 'Pagó empleado' : 'Pagó empresa',
    })
  }

  events.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0
    const tb = b.at ? new Date(b.at).getTime() : 0
    return tb - ta
  })

  return events.slice(0, 40)
}

// ── Gastos ──────────────────────────────────────────────────────────────────

/** Normaliza el selector de analítica a un dict Odoo 18:
 *    analyticDistribution: null | number (id) | { id: pct, ... }
 *  → siempre devuelve un dict con strings como keys o undefined.
 */
function normalizeAnalyticDistribution(input) {
  if (!input) return undefined
  if (typeof input === 'number') {
    return { [String(input)]: 100.0 }
  }
  if (typeof input === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(input)) {
      if (!k) continue
      const pct = Number(v)
      if (!Number.isFinite(pct) || pct <= 0) continue
      out[String(k)] = pct
    }
    return Object.keys(out).length ? out : undefined
  }
  return undefined
}

/** Crea un gasto. Respeta BACKEND_CAPS para mantener compatibilidad con
 *  ambientes donde `gf_pwa_admin` aún no esté instalado. */
export async function createExpense(payload) {
  const clean = { ...payload }

  // Analítica — Opción A (analytic_distribution dict Odoo 18)
  const dist = normalizeAnalyticDistribution(clean.analytic_distribution)
  if (BACKEND_CAPS.expenseAnalytics && dist) {
    clean.analytic_distribution = dist
  } else {
    delete clean.analytic_distribution
  }
  // Limpieza de legacy — ya no se usan
  delete clean.analytic_account_id
  delete clean.analytic_tag_ids

  // Metadata estructurada (employee_id + warehouse_id + sucursal_code)
  if (!BACKEND_CAPS.expenseStructuredMeta) {
    delete clean.employee_id
    delete clean.warehouse_id
    delete clean.sucursal_code
  }

  // El backend espera `unit_amount` (hr.expense nativo), no `total_amount`.
  if (clean.total_amount != null && clean.unit_amount == null) {
    clean.unit_amount = Number(clean.total_amount)
    delete clean.total_amount
  }

  return apiCreateExpense(clean)
}

// ── Requisiciones ───────────────────────────────────────────────────────────

/** Crea una requisición (purchase.order draft) con analytic_distribution. */
export async function createRequisition(payload) {
  const clean = { ...payload }

  const dist = normalizeAnalyticDistribution(clean.analytic_distribution)
  if (BACKEND_CAPS.requisitionAnalytics && dist) {
    clean.analytic_distribution = dist
  } else {
    delete clean.analytic_distribution
  }
  delete clean.analytic_account_id
  delete clean.analytic_tag_ids

  return apiCreateRequisition(clean)
}

// ── Cierre del día ──────────────────────────────────────────────────────────

/** Denominaciones MXN aceptadas por gf.cash.closing.denomination.
 *  El valor es el key string que espera el backend. */
export const CASH_DENOMINATIONS = [
  { key: '1000', label: '$1,000', value: 1000 },
  { key: '500',  label: '$500',   value: 500 },
  { key: '200',  label: '$200',   value: 200 },
  { key: '100',  label: '$100',   value: 100 },
  { key: '50',   label: '$50',    value: 50 },
  { key: '20',   label: '$20',    value: 20 },
  { key: '10',   label: '$10',    value: 10 },
  { key: '5',    label: '$5',     value: 5 },
  { key: '2',    label: '$2',     value: 2 },
  { key: '1',    label: '$1',     value: 1 },
  { key: '0.5',  label: '$0.50',  value: 0.5 },
]

/** Crea cierre de caja formal.
 *
 *  Payload unificado que acepta ambas formas:
 *    Forma A — clásica (con denominaciones + fondo):
 *      { companyId, warehouseId, openingFund, denominations[], otherIncome, otherExpense, notes, close }
 *    Forma B — contrato backend nuevo (2026-04-18):
 *      { sucursal, expected_amount, actual_amount, notes, attachment_id }
 *
 *  Se envían ambos al backend: la API es retro-compatible y acepta
 *  `expected_amount`/`actual_amount` como override cuando están presentes.
 *  Esto permite migrar sin romper el flujo antiguo. */
export async function createCashClosing(payload) {
  if (!BACKEND_CAPS.cashClosingWrite) {
    throw new Error('Cierre del día no disponible en este ambiente')
  }
  const clean = {
    // Identidad y contexto
    company_id:   payload.companyId   ?? payload.company_id,
    warehouse_id: payload.warehouseId ?? payload.warehouse_id,
    sucursal:     payload.sucursal    ?? undefined,

    // Forma B — contrato nuevo (guía de pruebas 2026-04-18, sección 1)
    expected_amount: payload.expectedAmount ?? payload.expected_amount,
    actual_amount:   payload.actualAmount   ?? payload.actual_amount,
    attachment_id:   payload.attachmentId   ?? payload.attachment_id ?? undefined,

    // Forma A — clásica (denominaciones + fondo)
    opening_fund: Number(payload.openingFund ?? payload.opening_fund ?? 0),
    denominations: Array.isArray(payload.denominations)
      ? payload.denominations
          .filter(d => Number(d.count) > 0)
          .map(d => ({
            denomination: String(d.denomination ?? d.key),
            count:        Number(d.count),
          }))
      : [],
    other_income:  Number(payload.otherIncome  ?? payload.other_income  ?? 0),
    other_expense: Number(payload.otherExpense ?? payload.other_expense ?? 0),

    // Notas y cierre formal
    notes: payload.notes?.trim() || undefined,
    close: payload.close !== false,
  }
  return apiCreateCashClosing(clean)
}

// ── Re-exports cómodos ──────────────────────────────────────────────────────
export { getTodaySales, getTodayExpenses, getExpensesHistory }
