// ─── API Helper Central — Bypass-safe ────────────────────────────────────────
// Mantiene n8n como fallback, pero resuelve primero los endpoints que ya viven
// directo en Odoo para evitar 401s cuando n8n no está alineado con la app.

const N8N_BASE = '/api-n8n'
const ODOO_BASE = '/odoo-api'
const NO_DIRECT = Symbol('no_direct')

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem('gf_session') || '{}')
  } catch {
    return {}
  }
}

function getToken() {
  return getSession().session_token || ''
}

function getApiKey() {
  const session = getSession()
  return session.odoo_api_key || session.api_key || ''
}

function getEmployeeToken() {
  const session = getSession()
  return session.odoo_employee_token || session.gf_employee_token || ''
}

function getEmployeeId() {
  const session = getSession()
  return Number(session.employee_id || session.employee?.id || 0) || 0
}

function getWarehouseId() {
  const session = getSession()
  return Number(session.warehouse_id || session.plant_warehouse_id || 0) || 0
}

function getCompanyId() {
  const session = getSession()
  return Number(session.company_id || 0) || 0
}

function isBypass() {
  return getSession()._bypass === true
}

function expireSession() {
  if (!isBypass()) {
    window.dispatchEvent(new Event('gf:session-expired'))
  }
}

function buildBaseHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const apiKey = getApiKey()
  if (apiKey) headers['Api-Key'] = apiKey
  const employeeToken = getEmployeeToken()
  if (employeeToken) headers['X-GF-Employee-Token'] = employeeToken
  return headers
}

function buildJsonRpcPayload(params) {
  return {
    jsonrpc: '2.0',
    method: 'call',
    params,
    id: Date.now(),
  }
}

function toQueryString(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  return query.toString()
}

function pickFirstResponse(payload) {
  if (Array.isArray(payload)) return payload[0] || null
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.response)) return payload.response[0] || null
    if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) return payload.data
    if (payload.result && typeof payload.result === 'object') return pickFirstResponse(payload.result)
  }
  return payload || null
}

function pickListResponse(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.response)) return payload.response
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.result)) return payload.result
    if (payload.result && typeof payload.result === 'object') return pickListResponse(payload.result)
  }
  return []
}

async function odooJson(path, params = {}) {
  const res = await fetch(`${ODOO_BASE}${path}`, {
    method: 'POST',
    headers: buildBaseHeaders(),
    body: JSON.stringify(buildJsonRpcPayload(params)),
  })

  const text = await res.text().catch(() => '')
  let json = {}
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = { error: text }
    }
  }

  if (!res.ok) {
    const message = json?.error?.message || json?.message || `http_${res.status}`
    throw new Error(message)
  }

  return json?.result !== undefined ? json.result : json
}

async function odooHttp(method, path, query = {}, body) {
  const url = query && Object.keys(query).length
    ? `${ODOO_BASE}${path}?${toQueryString(query)}`
    : `${ODOO_BASE}${path}`

  const opts = {
    method,
    headers: buildBaseHeaders(),
  }
  if (body !== undefined) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const res = await fetch(url, opts)
  const text = await res.text().catch(() => '')
  let json = {}
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = { error: text }
    }
  }

  if (!res.ok) {
    const message = json?.error?.message || json?.message || `http_${res.status}`
    throw new Error(message)
  }

  return json
}

async function readModel(model, {
  fields = 'all',
  domain = [],
  many = [],
  tags = [],
  file = 'file',
  limit = 0,
  offset = 0,
  order = null,
  rec_id = null,
  sudo = 1,
} = {}) {
  const payload = {
    model,
    fields,
    domain,
    many,
    tags,
    file,
    limit,
    offset,
    order,
    rec_id,
    sudo,
  }
  return odooJson('/get_records', payload)
}

async function readModelSorted(model, {
  fields = 'all',
  domain = [],
  many = [],
  tags = [],
  file = 'file',
  limit = 0,
  sort_column = null,
  sort_desc = false,
  sudo = 1,
} = {}) {
  return odooJson('/get_records_sorted', {
    model,
    fields,
    domain,
    many,
    tags,
    file,
    limit,
    sort_column,
    sort_desc,
    sudo,
  })
}

async function createUpdate(payload) {
  return odooJson('/api/create_update', payload)
}

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return [fmt(start), fmt(end)]
}

function todayRange() {
  const today = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const start = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())} 00:00:00`
  const end = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())} 23:59:59`
  return [start, end]
}

function normalizeSaleOrder(order) {
  if (!order) return null
  const lines = order.order_line || order.order_lines || order.lines || []
  return {
    ...order,
    lines,
    order_lines: lines,
  }
}

async function directProfile(method, path, body) {
  if (path === '/pwa-employee-profile' && method === 'GET') {
    const employeeId = getEmployeeId()
    if (!employeeId) return { success: false, error: 'No employee session' }
    const result = await readModel('hr.employee', {
      fields: [
        'id',
        'name',
        'barcode',
        'user_id',
        'job_id',
        'warehouse_id',
        'work_email',
        'work_phone',
        'job_title',
        'department_id',
        'parent_id',
        'coach_id',
        'date_start',
        'remaining_leaves',
        'mobile_phone',
        'image_128',
        'company_id',
        'work_location_id',
      ],
      domain: [['id', '=', employeeId]],
      limit: 1,
      file: 'url',
      sudo: 1,
    })
    const employee = pickFirstResponse(result)
    return { success: true, data: employee || {} }
  }

  if (path === '/pwa-employee-phone' && method === 'PATCH') {
    const employeeId = getEmployeeId()
    const mobilePhone = String(body?.mobile_phone || '').trim()
    if (!employeeId) return { success: false, error: 'No employee session' }
    await createUpdate({
      model: 'hr.employee',
      method: 'update',
      ids: [employeeId],
      dict: { mobile_phone: mobilePhone },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: { mobile_phone: mobilePhone } }
  }

  if (path === '/pwa-employee-photo' && method === 'POST') {
    const employeeId = getEmployeeId()
    if (!employeeId) return { success: false, error: 'No employee session' }
    const image128 = body?.image_128 === false ? false : body?.image_128 || ''
    await createUpdate({
      model: 'hr.employee',
      method: 'update',
      ids: [employeeId],
      dict: { image_128: image128 },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    const data = image128 ? { image_128: image128 } : { image_128: false }
    return { success: true, ...data, data }
  }

  if (path === '/pwa-logout' && method === 'POST') {
    try {
      await odooJson('/gf/logistics/api/employee/sign_out', {})
    } catch {
      // fire and forget
    }
    return { success: true }
  }

  return NO_DIRECT
}

async function directGerente(method, path) {
  if (path === '/pwa-gerente/alerts' && method === 'GET') {
    const companyId = getCompanyId()
    const [start, end] = todayRange()
    const domain = [['date', '>=', start], ['date', '<=', end]]
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('gf.ops.event_log', {
      fields: ['id', 'source', 'event_type', 'analytic_account_id', 'company_id', 'status', 'date', 'response_status'],
      domain,
      sort_column: 'date',
      sort_desc: true,
      limit: 50,
      sudo: 1,
    })
    const rows = pickListResponse(result).map((row) => ({
      id: row.id,
      event_type: row.event_type || 'event',
      status: row.status || 'new',
      source: row.source || '',
      sucursal: row.analytic_account_id?.[1] || row.company_id?.[1] || '',
      date: row.date || null,
    }))
    return rows
  }

  if (path === '/pwa-gerente/kpi-summary' && method === 'GET') {
    const companyId = getCompanyId()
    const today = new Date()
    const [startMonth, endMonth] = monthRange(today)
    const domain = [['date_kpi', '>=', startMonth], ['date_kpi', '<', endMonth]]
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('gf.saleops.kpi.snapshot', {
      fields: ['id', 'date_kpi', 'analytic_account_id', 'company_id', 'sales_qty', 'forecast_qty', 'pt_available_qty', 'en_available_qty', 'vans_available_qty'],
      domain,
      sort_column: 'date_kpi',
      sort_desc: true,
      limit: 1,
      sudo: 1,
    })
    const row = pickFirstResponse(result)
    if (!row) {
      return { sales_today: 0, forecast: 0, available: 0 }
    }
    return {
      sales_today: Number(row.sales_qty || 0),
      forecast: Number(row.forecast_qty || 0),
      available: Number(row.pt_available_qty || 0) + Number(row.en_available_qty || 0) + Number(row.vans_available_qty || 0),
      date_kpi: row.date_kpi || null,
      sucursal: row.analytic_account_id?.[1] || row.company_id?.[1] || '',
    }
  }

  if (path === '/pwa-gerente/forecasts-locked' && method === 'GET') {
    const companyId = getCompanyId()
    const domain = [['state', '=', 'confirmed']]
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('gf.saleops.forecast', {
      fields: ['id', 'name', 'analytic_account_id', 'company_id', 'date_target', 'state', 'created_by_employee_id', 'confirmed_by_employee_id', 'confirmed_at'],
      domain,
      sort_column: 'date_target',
      sort_desc: true,
      limit: 50,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      analytic_account_id: row.analytic_account_id,
      company_id: row.company_id,
      date_target: row.date_target,
      state: row.state,
      created_by_employee_id: row.created_by_employee_id,
      confirmed_by_employee_id: row.confirmed_by_employee_id,
      confirmed_at: row.confirmed_at,
    }))
  }

  if (path === '/pwa-gerente/forecast-unlock' && method === 'POST') {
    const forecastId = Number(body?.forecast_id || 0)
    if (!forecastId) return { success: false, error: 'forecast_id requerido' }
    const result = await createUpdate({
      model: 'gf.saleops.forecast',
      method: 'function',
      ids: [forecastId],
      function: 'action_reset_to_draft',
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  return NO_DIRECT
}

async function directAdmin(method, path, body) {
  const warehouseId = getWarehouseId()
  const companyId = getCompanyId()
  const [todayStart, todayEnd] = todayRange()

  if (path === '/pwa-admin/pos-products' && method === 'GET') {
    const result = await readModelSorted('product.product', {
      fields: ['id', 'name', 'list_price', 'lst_price', 'qty_available', 'barcode', 'sale_ok', 'available_in_pos', 'weight'],
      domain: [['sale_ok', '=', true]],
      sort_column: 'name',
      sort_desc: false,
      limit: 400,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.list_price ?? row.lst_price ?? 0),
      stock: Number(row.qty_available ?? 0),
      barcode: row.barcode || '',
      weight: Number(row.weight ?? 0),
      sale_ok: row.sale_ok !== false,
      available_in_pos: row.available_in_pos !== false,
    }))
  }

  if (path === '/pwa-admin/customers' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const q = String(query.get('q') || '').trim()
    const domain = ['|', '|', ['name', 'ilike', q], ['email', 'ilike', q], ['mobile', 'ilike', q]]
    const result = await readModelSorted('res.partner', {
      fields: ['id', 'name', 'email', 'mobile', 'phone', 'vat', 'customer_rank', 'is_company'],
      domain: q ? domain : [['customer_rank', '>', 0]],
      sort_column: 'name',
      sort_desc: false,
      limit: 30,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email || '',
      phone: row.phone || row.mobile || '',
      mobile: row.mobile || '',
      vat: row.vat || '',
      is_company: row.is_company,
    }))
  }

  if (path === '/pwa-admin/default-customer' && method === 'GET') {
    const result = await readModelSorted('res.partner', {
      fields: ['id', 'name', 'email', 'mobile', 'phone'],
      domain: ['|', ['name', 'ilike', 'PUBLIC'], ['name', 'ilike', 'PUBLICO']],
      sort_column: 'name',
      sort_desc: false,
      limit: 1,
      sudo: 1,
    })
    const row = pickFirstResponse(result)
    return row ? { id: row.id, name: row.name, email: row.email || '', phone: row.phone || row.mobile || '' } : null
  }

  if (path === '/pwa-admin/today-sales' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const reqWarehouseId = Number(query.get('warehouse_id') || warehouseId || 0)
    const domain = [['date_order', '>=', todayStart], ['date_order', '<=', todayEnd]]
    if (reqWarehouseId) domain.push(['warehouse_id', '=', reqWarehouseId])
    const result = await readModelSorted('sale.order', {
      fields: ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order', 'warehouse_id', 'payment_method', 'x_studio_mtodo_de_pago'],
      domain,
      sort_column: 'date_order',
      sort_desc: true,
      limit: 100,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      folio: row.name,
      customer: row.partner_id?.[1] || '',
      total: Number(row.amount_total || 0),
      state: row.state || 'draft',
      date_order: row.date_order || null,
      warehouse_id: row.warehouse_id?.[0] || reqWarehouseId || 0,
      payment_method: row.payment_method || row.x_studio_mtodo_de_pago || '',
    }))
  }

  if (path === '/pwa-admin/today-expenses' && method === 'GET') {
    const domain = [['date', '>=', todayStart], ['date', '<=', todayEnd]]
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('hr.expense', {
      fields: ['id', 'name', 'date', 'state', 'total_amount', 'company_id', 'employee_id', 'description'],
      domain,
      sort_column: 'date',
      sort_desc: true,
      limit: 100,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name || row.description || 'Gasto',
      description: row.description || '',
      amount: Number(row.total_amount || 0),
      date: row.date || null,
      state: row.state || 'draft',
      company_id: row.company_id?.[0] || 0,
      employee_id: row.employee_id?.[0] || 0,
    }))
  }

  if (path === '/pwa-admin/cash-closing' && method === 'GET') {
    const sales = await directAdmin('GET', `/pwa-admin/today-sales?warehouse_id=${warehouseId || ''}`)
    const expenses = await directAdmin('GET', '/pwa-admin/today-expenses')
    const totalSales = Array.isArray(sales) ? sales.reduce((sum, row) => sum + Number(row.total || 0), 0) : 0
    const totalExpenses = Array.isArray(expenses) ? expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0) : 0
    return {
      warehouse_id: warehouseId || 0,
      total_sales: totalSales,
      total_expenses: totalExpenses,
      balance: totalSales - totalExpenses,
      sales_count: Array.isArray(sales) ? sales.length : 0,
      expenses_count: Array.isArray(expenses) ? expenses.length : 0,
      sales,
      expenses,
    }
  }

  if (path === '/pwa-admin/find-ticket' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const folio = String(query.get('folio') || '').trim()
    if (!folio) return null
    const result = await readModelSorted('sale.order', {
      fields: ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order', 'warehouse_id', 'payment_method', 'x_studio_mtodo_de_pago'],
      domain: [['name', 'ilike', folio]],
      sort_column: 'id',
      sort_desc: true,
      limit: 1,
      sudo: 1,
    })
    const row = pickFirstResponse(result)
    return row ? normalizeSaleOrder({
      ...row,
      customer: row.partner_id?.[1] || '',
      total: Number(row.amount_total || 0),
    }) : null
  }

  if (path === '/pwa-admin/sale-detail' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const orderId = Number(query.get('order_id') || 0)
    if (!orderId) return null
    const result = await readModel('sale.order', {
      fields: ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order', 'payment_method', 'x_studio_mtodo_de_pago', 'warehouse_id'],
      domain: [['id', '=', orderId]],
      many: ['order_line'],
      file: 'file',
      limit: 1,
      sudo: 1,
    })
    const order = pickFirstResponse(result)
    if (!order) return null
    return normalizeSaleOrder({
      ...order,
      total: Number(order.amount_total || 0),
      customer: order.partner_id?.[1] || '',
    })
  }

  if (path === '/pwa-admin/pending-tickets' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const reqWarehouseId = Number(query.get('warehouse_id') || warehouseId || 0)
    const domain = [['state', 'in', ['sale', 'done']]]
    if (reqWarehouseId) domain.push(['warehouse_id', '=', reqWarehouseId])
    const result = await readModelSorted('sale.order', {
      fields: ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order', 'warehouse_id', 'payment_method', 'x_studio_mtodo_de_pago'],
      domain,
      sort_column: 'date_order',
      sort_desc: true,
      limit: 100,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      customer: row.partner_id?.[1] || '',
      total: Number(row.amount_total || 0),
      state: row.state || 'sale',
      date_order: row.date_order || null,
      warehouse_id: row.warehouse_id?.[0] || reqWarehouseId || 0,
    }))
  }

  if (path === '/pwa-admin/dispatch-ticket' && method === 'POST') {
    const result = await odooJson('/public_api/sale_order/validate_deliveries', {
      sale_order_id: Number(body?.order_id || 0),
    })
    return result
  }

  return NO_DIRECT
}

async function directProduction(method, path, body) {
  const query = new URLSearchParams(path.split('?')[1] || '')

  if (path === '/pwa-prod/my-shift' && method === 'GET') {
    const current = await odooHttp('GET', '/api/production/shift/current', {
      warehouse_id: getWarehouseId() || undefined,
    })
    const shiftId = Number(current?.data?.shift_id || current?.shift_id || 0)
    if (!shiftId) return null
    const result = await readModel('gf.production.shift', {
      fields: [
        'id',
        'name',
        'date',
        'shift_code',
        'plant_warehouse_id',
        'leader_employee_id',
        'operator_employee_ids',
        'state',
        'start_time',
        'end_time',
        'total_kg_produced',
        'total_kg_packed',
        'total_downtime_min',
        'total_scrap_kg',
        'energy_kwh',
        'energy_kwh_per_kg',
        'yield_pct',
        'stops_total',
        'stops_done',
      ],
      domain: [['id', '=', shiftId]],
      limit: 1,
      sudo: 1,
    })
    const shift = pickFirstResponse(result)
    if (!shift) return null
    return {
      id: shift.id,
      name: shift.name,
      date: shift.date,
      shift_code: shift.shift_code,
      state: shift.state,
      warehouse_id: shift.plant_warehouse_id?.[0] || 0,
      warehouse_name: shift.plant_warehouse_id?.[1] || '',
      total_kg_produced: Number(shift.total_kg_produced || 0),
      total_kg_packed: Number(shift.total_kg_packed || 0),
      total_downtime_min: Number(shift.total_downtime_min || 0),
      total_scrap_kg: Number(shift.total_scrap_kg || 0),
      energy_kwh: Number(shift.energy_kwh || 0),
      energy_kwh_per_kg: Number(shift.energy_kwh_per_kg || 0),
      yield_pct: Number(shift.yield_pct || 0),
      stops_total: Number(shift.stops_total || 0),
      stops_done: Number(shift.stops_done || 0),
    }
  }

  if (path === '/pwa-prod/shift-summary' && method === 'GET') {
    const result = await odooHttp('GET', '/api/production/dashboard', {
      shift_id: query.get('shift_id') || '',
    })
    return result?.data || result
  }

  if (path === '/pwa-prod/checklist' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return null
    const result = await readModel('gf.haccp.checklist', {
      fields: ['id', 'shift_id', 'route_plan_id', 'template_id', 'state', 'completed_by_id', 'completed_at', 'notes'],
      domain: [['shift_id', '=', shiftId]],
      many: ['check_ids'],
      limit: 1,
      sudo: 1,
    })
    const checklist = pickFirstResponse(result)
    if (!checklist) return null
    return {
      ...checklist,
      checks: checklist.check_ids || [],
    }
  }

  if (path === '/pwa-prod/checklist-check' && method === 'POST') {
    const result = await createUpdate({
      model: 'gf.haccp.check',
      method: 'update',
      ids: [Number(body?.check_id || 0)],
      dict: {
        ...(body?.result_bool !== undefined ? { result_bool: !!body.result_bool } : {}),
        ...(body?.result_numeric !== undefined ? { result_numeric: Number(body.result_numeric || 0) } : {}),
        ...(body?.result_text !== undefined ? { result_text: body.result_text } : {}),
        ...(body?.result_photo !== undefined ? { result_photo: body.result_photo } : {}),
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return result
  }

  if (path === '/pwa-prod/checklist-complete' && method === 'POST') {
    return createUpdate({
      model: 'gf.haccp.checklist',
      method: 'function',
      ids: [Number(body?.checklist_id || 0)],
      function: 'action_complete',
      sudo: 1,
      app: 'pwa_colaboradores',
    })
  }

  if (path === '/pwa-prod/cycles' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return []
    const result = await readModelSorted('gf.evaporator.cycle', {
      fields: ['id', 'shift_id', 'machine_id', 'state', 'freeze_start', 'freeze_end', 'defrost_start', 'defrost_end', 'kg_dumped', 'kg_expected', 'kg_deviation_pct', 'alert_level', 'cycle_number'],
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'id',
      sort_desc: true,
      limit: 100,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  if (path === '/pwa-prod/cycle-create' && method === 'POST') {
    const result = await odooHttp('POST', '/api/production/cycle/start', {}, {
      shift_id: Number(body?.shift_id || 0),
      machine_id: Number(body?.machine_id || 0),
    })
    return result?.data || result
  }

  if (path === '/pwa-prod/cycle-update' && method === 'POST') {
    const cycleId = Number(body?.cycle_id || 0)
    const updates = { ...(body || {}) }
    delete updates.cycle_id
    if (updates.kg_dumped !== undefined) {
      const dumpRes = await odooHttp('POST', '/api/production/cycle/dump', {}, {
        cycle_id: cycleId,
        kg_dumped: Number(updates.kg_dumped || 0),
      })
      delete updates.kg_dumped
      if (Object.keys(updates).length) {
        await createUpdate({
          model: 'gf.evaporator.cycle',
          method: 'update',
          ids: [cycleId],
          dict: updates,
          sudo: 1,
          app: 'pwa_colaboradores',
        })
      }
      return dumpRes?.data || dumpRes
    }
    return createUpdate({
      model: 'gf.evaporator.cycle',
      method: 'update',
      ids: [cycleId],
      dict: updates,
      sudo: 1,
      app: 'pwa_colaboradores',
    })
  }

  if (path === '/pwa-prod/packing-products' && method === 'GET') {
    const result = await readModelSorted('product.product', {
      fields: ['id', 'name', 'weight', 'qty_available', 'sale_ok', 'available_in_pos'],
      domain: [['sale_ok', '=', true]],
      sort_column: 'name',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      weight: Number(row.weight || 0),
      qty_available: Number(row.qty_available || 0),
      sale_ok: row.sale_ok !== false,
      available_in_pos: row.available_in_pos !== false,
    }))
  }

  if (path === '/pwa-prod/packing-create' && method === 'POST') {
    const result = await odooHttp('POST', '/api/production/pack', {}, {
      shift_id: Number(body?.shift_id || 0),
      cycle_id: Number(body?.cycle_id || 0),
      product_id: Number(body?.product_id || 0),
      qty_bags: Number(body?.qty_bags || 0),
      production_order_id: Number(body?.production_order_id || 0),
    })
    return result?.data || result
  }

  if (path === '/pwa-prod/packing-entries' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return []
    const result = await readModelSorted('gf.packing.entry', {
      fields: ['id', 'shift_id', 'cycle_id', 'product_id', 'qty_bags', 'kg_per_bag', 'total_kg', 'operator_id', 'timestamp', 'production_order_id', 'posted', 'posted_at'],
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'id',
      sort_desc: true,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  if (path === '/pwa-prod/transformation-products' && method === 'GET') {
    const result = await readModelSorted('product.product', {
      fields: ['id', 'name', 'weight', 'qty_available', 'sale_ok'],
      domain: [['sale_ok', '=', true]],
      sort_column: 'name',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      weight: Number(row.weight || 0),
      qty_available: Number(row.qty_available || 0),
    }))
  }

  if (path === '/pwa-prod/transformation-create' && method === 'POST') {
    const result = await createUpdate({
      model: 'gf.transformation.order',
      method: 'create',
      dict: {
        shift_id: Number(body?.shift_id || 0),
        input_product_id: Number(body?.input_product_id || 0),
        input_qty: Number(body?.input_qty || 0),
        scrap_kg: Number(body?.scrap_kg || 0),
        notes: body?.notes || '',
        room_temp: Number(body?.room_temp || 0),
        time_out_of_freezer_start: body?.time_out_start || false,
        time_out_of_freezer_end: body?.time_out_end || false,
        output_line_ids: Array.isArray(body?.output_lines)
          ? body.output_lines
              .filter((line) => line?.product_id && line?.qty)
              .map((line) => [0, 0, { product_id: Number(line.product_id), qty: Number(line.qty) }])
          : [],
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return result
  }

  if (path === '/pwa-prod/transformations' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return []
    const result = await readModelSorted('gf.transformation.order', {
      fields: ['id', 'shift_id', 'date', 'operator_id', 'state', 'input_product_id', 'input_qty', 'scrap_kg', 'scrap_reason', 'room_temp', 'notes', 'time_out_of_freezer_start', 'time_out_of_freezer_end'],
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'id',
      sort_desc: true,
      limit: 100,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  return NO_DIRECT
}

async function directRuta(method, path, body) {
  const query = new URLSearchParams(path.split('?')[1] || '')

  if (path === '/pwa-ruta/my-plan' && method === 'GET') {
    const empId = Number(query.get('employee_id') || getEmployeeId() || 0)
    if (!empId) return null
    const result = await readModelSorted('gf.route.plan', {
      fields: [
        'id',
        'name',
        'date',
        'route_id',
        'generation_mode',
        'state',
        'driver_employee_id',
        'salesperson_employee_id',
        'departure_time_target',
        'departure_time_real',
        'stops_total',
        'stops_done',
        'load_picking_id',
        'load_sealed',
        'bridge_key',
        'reconciliation_id',
      ],
      domain: ['|', ['driver_employee_id', '=', empId], ['salesperson_employee_id', '=', empId]],
      sort_column: 'date',
      sort_desc: true,
      limit: 1,
      sudo: 1,
    })
    return pickFirstResponse(result)
  }

  if (path === '/pwa-ruta/my-target' && method === 'GET') {
    const empId = Number(query.get('employee_id') || getEmployeeId() || 0)
    if (!empId) return null
    const [startMonth, endMonth] = monthRange()
    const result = await readModelSorted('hr.employee.monthly.target', {
      fields: ['id', 'employee_id', 'target_month', 'sales_target', 'collection_target', 'actual_sales', 'actual_collection'],
      domain: [['employee_id', '=', empId], ['target_month', '>=', startMonth], ['target_month', '<', endMonth]],
      sort_column: 'target_month',
      sort_desc: true,
      limit: 1,
      sudo: 1,
    })
    const row = pickFirstResponse(result)
    if (!row) return null
    return {
      id: row.id,
      employee_id: row.employee_id,
      target_month: row.target_month,
      sales_target: Number(row.sales_target || 0),
      collection_target: Number(row.collection_target || 0),
      sales_actual: Number(row.actual_sales || 0),
      collection_actual: Number(row.actual_collection || 0),
    }
  }

  if (path === '/pwa-ruta/my-load' && method === 'GET') {
    const routePlanId = Number(query.get('route_plan_id') || 0)
    if (!routePlanId) return null
    const result = await readModelSorted('gf.route.plan', {
      fields: ['id', 'load_picking_id', 'load_sealed', 'state', 'stops_total', 'stops_done', 'name'],
      domain: [['id', '=', routePlanId]],
      limit: 1,
      sudo: 1,
    })
    const row = pickFirstResponse(result)
    if (!row) return null
    return {
      id: row.id,
      load_picking_id: row.load_picking_id?.[0] || 0,
      load_sealed: row.load_sealed === true,
      state: row.state,
      stops_total: Number(row.stops_total || 0),
      stops_done: Number(row.stops_done || 0),
      products: row.products || [],
      lines: row.lines || [],
    }
  }

  if (path === '/pwa-ruta/load-lines' && method === 'GET') {
    const pickingId = Number(query.get('picking_id') || 0)
    if (!pickingId) return []
    const result = await readModelSorted('stock.move', {
      fields: ['id', 'picking_id', 'product_id', 'product_uom_qty', 'quantity_done', 'name', 'state'],
      domain: [['picking_id', '=', pickingId]],
      sort_column: 'id',
      sort_desc: false,
      limit: 500,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      picking_id: row.picking_id?.[0] || pickingId,
      product_id: row.product_id,
      product_name: row.product_id?.[1] || row.name || '',
      qty: Number(row.product_uom_qty || row.quantity_done || 0),
      quantity: Number(row.product_uom_qty || row.quantity_done || 0),
      state: row.state || '',
    }))
  }

  if (path === '/pwa-ruta/reconciliation' && method === 'GET') {
    const routePlanId = Number(query.get('route_plan_id') || 0)
    if (!routePlanId) return null
    const result = await readModel('gf.dispatch.reconciliation', {
      fields: ['id', 'route_plan_id', 'state', 'total_expected', 'total_received', 'difference', 'line_ids'],
      domain: [['route_plan_id', '=', routePlanId]],
      many: ['line_ids'],
      limit: 1,
      sudo: 1,
    })
    const row = pickFirstResponse(result)
    return row || null
  }

  if (path === '/pwa-ruta/incident-create' && method === 'POST') {
    return createUpdate({
      model: 'gf.route.incident',
      method: 'create',
      dict: {
        name: body?.name || body?.incident_type || 'Incidencia',
        employee_id: Number(body?.employee_id || getEmployeeId() || 0),
        incident_type: body?.incident_type || 'other',
        severity: body?.severity || 'medium',
        requires_follow_up: body?.requires_follow_up ?? true,
        active: body?.active ?? true,
        company_id: Number(body?.company_id || getCompanyId() || 0),
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
  }

  if (path === '/pwa-ruta/my-incidents' && method === 'GET') {
    const empId = Number(query.get('employee_id') || getEmployeeId() || 0)
    if (!empId) return []
    const result = await readModelSorted('gf.route.incident', {
      fields: ['id', 'name', 'employee_id', 'incident_type', 'severity', 'requires_follow_up', 'active', 'company_id', 'create_date'],
      domain: [['employee_id', '=', empId]],
      sort_column: 'create_date',
      sort_desc: true,
      limit: 100,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  return NO_DIRECT
}

async function routeDirect(method, path, body) {
  const cleanPath = path.split('?')[0]

  const directHandlers = [
    directProfile,
    directGerente,
    directAdmin,
    directProduction,
    directRuta,
  ]

  for (const handler of directHandlers) {
    const result = await handler(method, cleanPath + (path.includes('?') ? `?${path.split('?')[1]}` : ''), body)
    if (result !== NO_DIRECT) return result
  }

  return NO_DIRECT
}

/**
 * Llamada genérica a la API.
 * Primero intenta resolver en Odoo directo; si no existe, cae a n8n.
 */
export async function api(method, path, body) {
  const token = getToken()
  if (!token) {
    expireSession()
    throw new Error('no_session')
  }

  if (isBypass()) {
    throw new Error('bypass_no_api')
  }

  const direct = await routeDirect(method, path, body)
  if (direct !== NO_DIRECT) {
    return direct
  }

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }
  const apiKey = getApiKey()
  if (apiKey) {
    opts.headers['Api-Key'] = apiKey
  }
  const employeeToken = getEmployeeToken()
  if (employeeToken) {
    opts.headers['X-GF-Employee-Token'] = employeeToken
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(`${N8N_BASE}${path}`, opts)

  if (!res.ok) {
    if (res.status === 401) {
      expireSession()
      throw new Error('no_session')
    }
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `http_${res.status}`)
  }

  const json = await res.json()
  // n8n suele devolver { data: ... }.
  return json.data !== undefined ? json.data : json
}

export function apiGet(path) {
  return api('GET', path)
}

export function apiPost(path, body) {
  return api('POST', path, body)
}

export function apiPatch(path, body) {
  return api('PATCH', path, body)
}
