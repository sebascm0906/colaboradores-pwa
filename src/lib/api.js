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

function getExpenseAccountIdForCompany(companyId) {
  const map = {
    1: 64,
    34: 959,
    35: 1044,
    36: 1129,
  }
  return map[Number(companyId) || 0] || 0
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
        'first_contract_date',
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
  const cleanPath = path.split('?')[0]
  const warehouseId = getWarehouseId()
  const companyId = getCompanyId()
  const [todayStart, todayEnd] = todayRange()

  if (cleanPath === '/pwa-admin/pos-products' && method === 'GET') {
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

  if (cleanPath === '/pwa-admin/customers' && method === 'GET') {
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

  if (cleanPath === '/pwa-admin/default-customer' && method === 'GET') {
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

  if (cleanPath === '/pwa-admin/today-sales' && method === 'GET') {
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

  if (cleanPath === '/pwa-admin/today-expenses' && method === 'GET') {
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

  if (cleanPath === '/pwa-admin/expenses-history' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const q = String(query.get('q') || '').trim()
    const capturer = String(query.get('capturer') || '').trim()
    const state = String(query.get('state') || '').trim()
    const employeeId = Number(query.get('employee_id') || 0) || 0
    const companyIdParam = Number(query.get('company_id') || 0) || 0
    const dateFrom = String(query.get('date_from') || '').trim()
    const dateTo = String(query.get('date_to') || '').trim()

    const domain = []
    if (dateFrom || dateTo) {
      if (dateFrom) domain.push(['date', '>=', dateFrom])
      if (dateTo) domain.push(['date', '<=', dateTo])
    } else {
      domain.push(['date', '>=', todayStart], ['date', '<=', todayEnd])
    }
    const effectiveCompanyId = companyIdParam || companyId || 0
    if (effectiveCompanyId) domain.push(['company_id', '=', effectiveCompanyId])
    if (employeeId) domain.push(['employee_id', '=', employeeId])
    if (capturer) {
      const employeeResult = await readModelSorted('hr.employee', {
        fields: ['id', 'name', 'company_id'],
        domain: [
          ...(effectiveCompanyId ? [['company_id', '=', effectiveCompanyId]] : []),
          ['name', 'ilike', capturer],
        ],
        sort_column: 'name',
        sort_desc: false,
        limit: 50,
        sudo: 1,
      })
      const employeeIds = pickListResponse(employeeResult).map((row) => row.id).filter(Boolean)
      if (employeeIds.length) {
        domain.push(['employee_id', 'in', employeeIds])
      } else {
        domain.push(['id', '=', 0])
      }
    }
    if (state) domain.push(['state', '=', state])

    const result = await readModelSorted('hr.expense', {
      fields: ['id', 'name', 'date', 'state', 'total_amount', 'company_id', 'employee_id', 'description', 'account_id'],
      domain,
      sort_column: 'date',
      sort_desc: true,
      limit: 0,
      sudo: 1,
    })

    const items = pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name || row.description || 'Gasto',
      description: row.description || '',
      total_amount: Number(row.total_amount || 0),
      date: row.date || null,
      state: row.state || 'draft',
      company_id: row.company_id?.[0] || 0,
      company_name: row.company_id?.[1] || '',
      employee_id: row.employee_id?.[0] || 0,
      employee_name: row.employee_id?.[1] || '',
      account_id: row.account_id?.[0] || 0,
    })).filter((row) => {
      if (!q) return true
      const haystack = `${row.name || ''} ${row.description || ''}`.toLowerCase()
      return haystack.includes(q.toLowerCase())
    })

    const total = items.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
    return {
      items,
      summary: {
        count: items.length,
        total_amount: total,
      },
      filters: {
        company_id: effectiveCompanyId || null,
        employee_id: employeeId || null,
        capturer: capturer || '',
        state: state || null,
        q: q || '',
        date_from: dateFrom || null,
        date_to: dateTo || null,
      },
    }
  }

  if (cleanPath === '/pwa-admin/expense-create' && method === 'POST') {
    const employeeId = getEmployeeId()
    if (!employeeId) return { success: false, error: 'No employee session' }

    const totalAmount = Number(body?.total_amount || body?.amount || 0)
    const quantity = Number(body?.quantity || 1) || 1
    const companyIdPayload = Number(body?.company_id || companyId || 0)
    const accountId = Number(body?.account_id || getExpenseAccountIdForCompany(companyIdPayload) || 0)
    const rawDescription = String(body?.description || '').trim()
    const contextParts = []
    if (body?.sucursal) contextParts.push(`[Sucursal: ${String(body.sucursal).trim()}]`)
    if (body?.capturista) contextParts.push(`[Capturó: ${String(body.capturista).trim()}]`)
    const description = [rawDescription, contextParts.join(' ')].filter(Boolean).join('\n') || '\n'

    const result = await createUpdate({
      model: 'hr.expense',
      method: 'create',
      dict: {
        name: String(body?.name || '').trim(),
        date: body?.date || todayStart.slice(0, 10),
        employee_id: employeeId,
        company_id: companyIdPayload || undefined,
        payment_mode: body?.payment_mode || 'company_account',
        quantity,
        total_amount: totalAmount,
        description,
        account_id: accountId || undefined,
        product_id: body?.product_id ? Number(body.product_id) : undefined,
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })

    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-admin/cash-closing' && method === 'GET') {
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

  if (cleanPath === '/pwa-admin/find-ticket' && method === 'GET') {
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

  if (cleanPath === '/pwa-admin/sale-detail' && method === 'GET') {
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

  if (cleanPath === '/pwa-admin/pending-tickets' && method === 'GET') {
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

  if (cleanPath === '/pwa-admin/dispatch-ticket' && method === 'POST') {
    const result = await odooJson('/public_api/sale_order/validate_deliveries', {
      sale_order_id: Number(body?.order_id || 0),
    })
    return result
  }

  // ── Analytic accounts (Odoo 18 — account.analytic.account) ──────────────
  // Usado por AnalyticAccountPicker en gastos/requisiciones.
  // Filtra por company_id. Respuesta compatible con el shape esperado:
  // { ok: true, data: { company_id, count, accounts: [{id, name, code, plan_name}] } }
  if (cleanPath === '/pwa-admin/analytic-accounts' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const reqCompanyId = Number(query.get('company_id') || companyId || 0)
    const domain = []
    if (reqCompanyId) {
      // account.analytic.account.company_id puede ser False (global); incluimos ambos
      domain.push('|', ['company_id', '=', reqCompanyId], ['company_id', '=', false])
    }
    const result = await readModelSorted('account.analytic.account', {
      fields: ['id', 'name', 'code', 'plan_id', 'company_id', 'active'],
      domain: domain.length ? domain : [['active', '=', true]],
      sort_column: 'name',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    const rows = pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name || '',
      code: row.code || '',
      plan_name: row.plan_id?.[1] || '',
      plan_id: row.plan_id?.[0] || 0,
      company_id: row.company_id?.[0] || 0,
    }))
    return {
      ok: true,
      data: {
        company_id: reqCompanyId || 0,
        count: rows.length,
        accounts: rows,
      },
    }
  }

  // ── Capabilities (feature flags leídos al boot) ─────────────────────────
  // Con n8n fuera de línea, devolvemos el set canónico de flags habilitados
  // para que bootCapabilities() no tenga que caer a defaults por error.
  // Estos flags reflejan lo que Sebastián tiene instalado en producción
  // (Sprint 3 + Sprint 4, audit 2026-04-10). Si algún flag cambia, ajustar aquí.
  if (cleanPath === '/pwa-admin/capabilities' && method === 'GET') {
    return {
      ok: true,
      data: {
        expenseAnalytics: true,
        requisitionAnalytics: true,
        expenseStructuredMeta: true,
        serverSideCompanyFilter: true,
        cashClosingRead: true,
        cashClosingWrite: true,
        liquidaciones: true,
        materiaPrima: true,
        productSearch: true,
        requisitionDetail: true,
        cashClosingHistory: true,
        expenseAttachments: true,
        saleCancel: true,
        liquidacionesHistory: true,
        mpKardex: true,
      },
    }
  }

  // ── Requisitions (purchase.order) ───────────────────────────────────────
  // Lista de requisiciones recientes. El frontend acepta array plano o
  // { data: { requisitions: [...] } }. Filtros: company_id, state, fechas.
  if (cleanPath === '/pwa-admin/requisitions' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const reqCompanyId = Number(query.get('company_id') || companyId || 0)
    const state = query.get('state') || ''
    const dateFrom = query.get('date_from') || ''
    const dateTo = query.get('date_to') || ''
    const limit = Number(query.get('limit') || 50)
    const domain = []
    if (reqCompanyId) domain.push(['company_id', '=', reqCompanyId])
    if (state) domain.push(['state', '=', state])
    if (dateFrom) domain.push(['date_order', '>=', dateFrom])
    if (dateTo) domain.push(['date_order', '<=', `${dateTo} 23:59:59`])
    const result = await readModelSorted('purchase.order', {
      fields: ['id', 'name', 'partner_id', 'state', 'date_order', 'amount_total', 'currency_id', 'company_id', 'origin', 'notes'],
      domain,
      sort_column: 'date_order',
      sort_desc: true,
      limit,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name || '',
      partner: row.partner_id?.[1] || '',
      state: row.state || 'draft',
      date: row.date_order || null,
      amount_total: Number(row.amount_total || 0),
      currency: row.currency_id?.[1] || 'MXN',
      company_id: row.company_id?.[0] || 0,
      origin: row.origin || '',
      notes: row.notes || '',
    }))
  }

  // ── Requisition detail (purchase.order + order_line) ────────────────────
  if (cleanPath === '/pwa-admin/requisition-detail' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const id = Number(query.get('id') || 0)
    if (!id) return { ok: false, error: 'id requerido' }
    const headerResult = await readModel('purchase.order', {
      fields: ['id', 'name', 'partner_id', 'state', 'date_order', 'amount_total', 'amount_untaxed', 'currency_id', 'company_id', 'origin', 'notes', 'order_line'],
      domain: [['id', '=', id]],
      limit: 1,
      sudo: 1,
    })
    const header = pickFirstResponse(headerResult)
    if (!header) return { ok: false, error: 'not_found' }
    const lineIds = Array.isArray(header.order_line) ? header.order_line : []
    let lines = []
    if (lineIds.length) {
      const linesResult = await readModel('purchase.order.line', {
        fields: ['id', 'name', 'product_id', 'product_qty', 'price_unit', 'price_subtotal', 'product_uom', 'analytic_distribution'],
        domain: [['id', 'in', lineIds]],
        limit: 0,
        sudo: 1,
      })
      lines = pickListResponse(linesResult).map((l) => ({
        id: l.id,
        name: l.name || '',
        product_id: l.product_id?.[0] || 0,
        product_name: l.product_id?.[1] || l.name || '',
        qty: Number(l.product_qty || 0),
        price_unit: Number(l.price_unit || 0),
        subtotal: Number(l.price_subtotal || 0),
        uom: l.product_uom?.[1] || '',
        analytic_distribution: l.analytic_distribution || {},
      }))
    }
    return {
      ok: true,
      data: {
        id: header.id,
        name: header.name || '',
        partner: header.partner_id?.[1] || '',
        partner_id: header.partner_id?.[0] || 0,
        state: header.state || 'draft',
        date: header.date_order || null,
        amount_total: Number(header.amount_total || 0),
        amount_untaxed: Number(header.amount_untaxed || 0),
        currency: header.currency_id?.[1] || 'MXN',
        company_id: header.company_id?.[0] || 0,
        origin: header.origin || '',
        notes: header.notes || '',
        lines,
      },
    }
  }

  // ── Requisition cancel ──────────────────────────────────────────────────
  if (cleanPath === '/pwa-admin/requisition-cancel' && method === 'POST') {
    const id = Number(body?.id || 0)
    if (!id) return { ok: false, error: 'id requerido' }
    await createUpdate({
      model: 'purchase.order',
      method: 'update',
      ids: [id],
      dict: { state: 'cancel' },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { ok: true, data: { id, state: 'cancel' } }
  }

  // ── Requisition create (purchase.order draft) ───────────────────────────
  // Creación mínima: crea el PO draft y sus líneas.
  if (cleanPath === '/pwa-admin/requisition-create' && method === 'POST') {
    const lines = Array.isArray(body?.lines) ? body.lines : []
    const created = await createUpdate({
      model: 'purchase.order',
      method: 'create',
      dict: {
        partner_id: Number(body?.partner_id || 0) || 1,
        company_id: Number(body?.company_id || companyId || 0) || undefined,
        origin: body?.name || body?.title || 'PWA Admin',
        notes: body?.description || body?.notes || '',
        state: 'draft',
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    const orderId = Number(pickFirstResponse(created)?.id || created?.id || 0)
    if (orderId && lines.length) {
      for (const line of lines) {
        await createUpdate({
          model: 'purchase.order.line',
          method: 'create',
          dict: {
            order_id: orderId,
            name: line.product_name || line.name || 'Item',
            product_qty: Number(line.qty || line.product_qty || 1),
            product_id: Number(line.product_id || 0) || undefined,
            price_unit: Number(line.price_unit || 0),
            analytic_distribution: line.analytic_distribution || undefined,
          },
          sudo: 1,
          app: 'pwa_colaboradores',
        })
      }
    }
    return { ok: true, data: { id: orderId, state: 'draft' } }
  }

  // ── Sale cancel ─────────────────────────────────────────────────────────
  if (cleanPath === '/pwa-admin/sale-cancel' && method === 'POST') {
    const id = Number(body?.order_id || 0)
    if (!id) return { ok: false, error: 'order_id requerido' }
    await createUpdate({
      model: 'sale.order',
      method: 'update',
      ids: [id],
      dict: {
        state: 'cancel',
        // Opcional: dejar razón en nota interna si el campo existe
        note: body?.reason ? `Cancelado PWA: ${body.reason}` : undefined,
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { ok: true, data: { id, state: 'cancel' } }
  }

  // ── Expense attachments (ir.attachment) ─────────────────────────────────
  if (cleanPath === '/pwa-admin/expense-attachments' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const expenseId = Number(query.get('expense_id') || 0)
    if (!expenseId) return { ok: true, data: { items: [] } }
    const result = await readModelSorted('ir.attachment', {
      fields: ['id', 'name', 'mimetype', 'file_size', 'create_date', 'create_uid'],
      domain: [['res_model', '=', 'hr.expense'], ['res_id', '=', expenseId]],
      sort_column: 'create_date',
      sort_desc: true,
      limit: 100,
      sudo: 1,
    })
    const items = pickListResponse(result).map((a) => ({
      id: a.id,
      name: a.name || '',
      mimetype: a.mimetype || '',
      size: Number(a.file_size || 0),
      created: a.create_date || null,
      created_by: a.create_uid?.[1] || '',
    }))
    return { ok: true, data: { items, count: items.length } }
  }

  // ── Expense attach (POST ir.attachment) ─────────────────────────────────
  if (cleanPath === '/pwa-admin/expense-attach' && method === 'POST') {
    const expenseId = Number(body?.expense_id || 0)
    if (!expenseId) return { ok: false, error: 'expense_id requerido' }
    const result = await createUpdate({
      model: 'ir.attachment',
      method: 'create',
      dict: {
        name: body?.filename || 'attachment',
        mimetype: body?.mime || 'application/octet-stream',
        datas: body?.base64 || '',
        res_model: 'hr.expense',
        res_id: expenseId,
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { ok: true, data: pickFirstResponse(result) || {} }
  }

  // ── Cash closing history (gf.cash.closing) ──────────────────────────────
  if (cleanPath === '/pwa-admin/cash-closing/history' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const reqCompanyId = Number(query.get('company_id') || companyId || 0)
    const reqWarehouseId = Number(query.get('warehouse_id') || warehouseId || 0)
    const dateFrom = query.get('date_from') || ''
    const dateTo = query.get('date_to') || ''
    const state = query.get('state') || ''
    const limit = Number(query.get('limit') || 50)
    const domain = []
    if (reqCompanyId) domain.push(['company_id', '=', reqCompanyId])
    if (reqWarehouseId) domain.push(['warehouse_id', '=', reqWarehouseId])
    if (dateFrom) domain.push(['date', '>=', dateFrom])
    if (dateTo) domain.push(['date', '<=', dateTo])
    if (state) domain.push(['state', '=', state])
    try {
      const result = await readModelSorted('gf.cash.closing', {
        fields: ['id', 'name', 'date', 'state', 'sales_total', 'expenses_total', 'counted_total', 'difference', 'warehouse_id', 'company_id', 'closed_by_id'],
        domain,
        sort_column: 'date',
        sort_desc: true,
        limit,
        sudo: 1,
      })
      const items = pickListResponse(result).map((r) => ({
        id: r.id,
        name: r.name || '',
        date: r.date || null,
        state: r.state || 'draft',
        sales_total: Number(r.sales_total || 0),
        expenses_total: Number(r.expenses_total || 0),
        counted_total: Number(r.counted_total || 0),
        difference: Number(r.difference || 0),
        warehouse: r.warehouse_id?.[1] || '',
        warehouse_id: r.warehouse_id?.[0] || 0,
        closed_by: r.closed_by_id?.[1] || '',
      }))
      return { ok: true, data: { items, count: items.length } }
    } catch {
      return { ok: true, data: { items: [], count: 0 } }
    }
  }

  // ── Cash closing detail ─────────────────────────────────────────────────
  if (cleanPath === '/pwa-admin/cash-closing/detail' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const id = Number(query.get('id') || 0)
    if (!id) return { ok: false, error: 'id requerido' }
    try {
      const result = await readModel('gf.cash.closing', {
        fields: ['id', 'name', 'date', 'state', 'sales_total', 'expenses_total', 'opening_fund', 'counted_total', 'difference', 'denominations', 'other_income', 'other_expense', 'notes', 'warehouse_id', 'company_id', 'closed_by_id'],
        domain: [['id', '=', id]],
        limit: 1,
        sudo: 1,
      })
      const row = pickFirstResponse(result)
      if (!row) return { ok: false, error: 'not_found' }
      return { ok: true, data: row }
    } catch {
      return { ok: false, error: 'cash_closing_not_available' }
    }
  }

  // ── Liquidaciones — proxy a pwa_admin_api controllers (gf_logistics_ops) ──
  // Sebastián arregló _route_plan_summary() y expuso los 4 controllers con
  // shapes correctos. Los stubs fueron removidos — ahora ruteamos directo.
  if (cleanPath === '/pwa-admin/liquidaciones/pending' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    return odooJson('/pwa-admin/liquidaciones/pending', {
      company_id: Number(query.get('company_id') || companyId || 0) || undefined,
      warehouse_id: Number(query.get('warehouse_id') || warehouseId || 0) || undefined,
    })
  }

  if (cleanPath === '/pwa-admin/liquidaciones/detail' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    return odooJson('/pwa-admin/liquidaciones/detail', {
      plan_id: Number(query.get('plan_id') || 0),
    })
  }

  if (cleanPath === '/pwa-admin/liquidaciones/validate' && method === 'POST') {
    return odooJson('/pwa-admin/liquidaciones/validate', {
      plan_id: Number(body?.plan_id || 0),
    })
  }

  if (cleanPath === '/pwa-admin/liquidaciones/history' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    return odooJson('/pwa-admin/liquidaciones/history', {
      company_id: Number(query.get('company_id') || companyId || 0) || undefined,
      warehouse_id: Number(query.get('warehouse_id') || warehouseId || 0) || undefined,
      date_from: query.get('date_from') || undefined,
      date_to: query.get('date_to') || undefined,
      limit: Number(query.get('limit') || 50),
      offset: Number(query.get('offset') || 0),
    })
  }

  // ── Materia Prima — stock.quant filtrado por locaciones MP ──────────────
  if (cleanPath === '/pwa-admin/materia-prima/stock' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const reqWarehouseId = Number(query.get('warehouse_id') || warehouseId || 0)
    const domain = [['quantity', '>', 0]]
    // Filtramos por locaciones que contengan "MP" o "MATERIA PRIMA" en el nombre.
    // Si el warehouse tiene configuración distinta, esto se ajusta en backend.
    if (reqWarehouseId) domain.push(['warehouse_id', '=', reqWarehouseId])
    const result = await readModelSorted('stock.quant', {
      fields: ['id', 'product_id', 'location_id', 'quantity', 'reserved_quantity', 'lot_id', 'warehouse_id'],
      domain,
      sort_column: 'product_id',
      sort_desc: false,
      limit: 500,
      sudo: 1,
    })
    const rows = pickListResponse(result)
      .filter((r) => {
        const locName = String(r.location_id?.[1] || '').toUpperCase()
        return locName.includes('MP') || locName.includes('MATERIA') || locName.includes('PRIMA')
      })
      .map((r) => ({
        id: r.id,
        product_id: r.product_id?.[0] || 0,
        product_name: r.product_id?.[1] || '',
        location: r.location_id?.[1] || '',
        qty_available: Number(r.quantity || 0) - Number(r.reserved_quantity || 0),
        quantity: Number(r.quantity || 0),
        reserved: Number(r.reserved_quantity || 0),
        lot_name: r.lot_id?.[1] || '',
        warehouse_id: r.warehouse_id?.[0] || 0,
      }))
    return { ok: true, data: { items: rows, count: rows.length } }
  }

  // ── Materia Prima — recepciones del día (stock.picking incoming) ───────
  if (cleanPath === '/pwa-admin/materia-prima/receipts' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const reqCompanyId = Number(query.get('company_id') || companyId || 0)
    const reqWarehouseId = Number(query.get('warehouse_id') || warehouseId || 0)
    const domain = [
      ['picking_type_code', '=', 'incoming'],
      ['scheduled_date', '>=', todayStart.slice(0, 10)],
      ['scheduled_date', '<=', todayEnd.slice(0, 10) + ' 23:59:59'],
    ]
    if (reqCompanyId) domain.push(['company_id', '=', reqCompanyId])
    const result = await readModelSorted('stock.picking', {
      fields: ['id', 'name', 'partner_id', 'state', 'scheduled_date', 'date_done', 'origin', 'location_dest_id'],
      domain,
      sort_column: 'scheduled_date',
      sort_desc: true,
      limit: 100,
      sudo: 1,
    })
    const rows = pickListResponse(result).map((r) => ({
      id: r.id,
      name: r.name || '',
      reference: r.name || '',
      partner_name: r.partner_id?.[1] || '',
      supplier: r.partner_id?.[1] || '',
      state: r.state || '',
      date: r.scheduled_date || null,
      date_done: r.date_done || null,
      origin: r.origin || '',
      destination: r.location_dest_id?.[1] || '',
    }))
    return { ok: true, data: { items: rows, count: rows.length } }
  }

  // ── Materia Prima — consumos (gf.transformation.order) ─────────────────
  if (cleanPath === '/pwa-admin/materia-prima/consumption' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const reqCompanyId = Number(query.get('company_id') || companyId || 0)
    const domain = [
      ['create_date', '>=', todayStart.slice(0, 10)],
      ['create_date', '<=', todayEnd.slice(0, 10) + ' 23:59:59'],
    ]
    if (reqCompanyId) domain.push(['company_id', '=', reqCompanyId])
    try {
      const result = await readModelSorted('gf.transformation.order', {
        fields: ['id', 'name', 'state', 'create_date', 'from_product_id', 'to_product_id', 'input_qty', 'output_qty'],
        domain,
        sort_column: 'create_date',
        sort_desc: true,
        limit: 100,
        sudo: 1,
      })
      const rows = pickListResponse(result).map((r) => ({
        id: r.id,
        name: r.name || '',
        reference: r.name || '',
        state: r.state || '',
        date: r.create_date || null,
        input_product_name: r.from_product_id?.[1] || '',
        output_product_name: r.to_product_id?.[1] || '',
        input_qty: Number(r.input_qty || 0),
        output_qty: Number(r.output_qty || 0),
      }))
      return { ok: true, data: { items: rows, count: rows.length } }
    } catch {
      return { ok: true, data: { items: [], count: 0 } }
    }
  }

  // ── Materia Prima — kardex (stock.move done por producto) ──────────────
  if (cleanPath === '/pwa-admin/materia-prima/moves' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const productId = Number(query.get('product_id') || 0)
    const dateFrom = query.get('date_from') || ''
    const dateTo = query.get('date_to') || ''
    const limit = Number(query.get('limit') || 200)
    if (!productId) return { ok: true, data: { moves: [] } }
    const domain = [['product_id', '=', productId], ['state', '=', 'done']]
    if (dateFrom) domain.push(['date', '>=', dateFrom])
    if (dateTo) domain.push(['date', '<=', `${dateTo} 23:59:59`])
    const result = await readModelSorted('stock.move', {
      fields: ['id', 'name', 'date', 'product_id', 'product_uom_qty', 'quantity', 'location_id', 'location_dest_id', 'origin', 'reference'],
      domain,
      sort_column: 'date',
      sort_desc: true,
      limit,
      sudo: 1,
    })
    const moves = pickListResponse(result).map((m) => {
      const qty = Number(m.quantity ?? m.product_uom_qty ?? 0)
      const srcName = String(m.location_id?.[1] || '').toUpperCase()
      const dstName = String(m.location_dest_id?.[1] || '').toUpperCase()
      const isIn = !srcName.includes('MP') && !srcName.includes('MATERIA') && (dstName.includes('MP') || dstName.includes('MATERIA'))
      return {
        id: m.id,
        name: m.name || '',
        date: m.date || null,
        reference: m.reference || m.origin || '',
        origin: m.origin || '',
        qty_in: isIn ? qty : 0,
        qty_out: isIn ? 0 : qty,
        delta: isIn ? qty : -qty,
        location_src: m.location_id?.[1] || '',
        location_dst: m.location_dest_id?.[1] || '',
      }
    })
    return { ok: true, data: { moves, count: moves.length } }
  }

  // ── Products search (product.product por nombre/SKU/barcode) ───────────
  if (cleanPath === '/pwa-admin/products/search' && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const q = String(query.get('q') || '').trim()
    const scope = String(query.get('scope') || 'all')
    const limit = Number(query.get('limit') || 30)
    const categId = Number(query.get('categ_id') || 0)
    const domain = [['sale_ok', '=', true]]
    if (q) {
      domain.push('|', '|', ['name', 'ilike', q], ['default_code', 'ilike', q], ['barcode', 'ilike', q])
    }
    if (categId) domain.push(['categ_id', '=', categId])
    if (scope === 'available') domain.push(['qty_available', '>', 0])
    const result = await readModelSorted('product.product', {
      fields: ['id', 'name', 'default_code', 'barcode', 'list_price', 'lst_price', 'qty_available', 'uom_id', 'categ_id', 'weight'],
      domain,
      sort_column: 'name',
      sort_desc: false,
      limit,
      sudo: 1,
    })
    const items = pickListResponse(result).map((p) => ({
      id: p.id,
      name: p.name || '',
      code: p.default_code || '',
      default_code: p.default_code || '',
      barcode: p.barcode || '',
      list_price: Number(p.list_price || p.lst_price || 0),
      qty_available: Number(p.qty_available || 0),
      uom: p.uom_id?.[1] || '',
      category: p.categ_id?.[1] || '',
      weight: Number(p.weight || 0),
    }))
    return { ok: true, data: { items, count: items.length } }
  }

  return NO_DIRECT
}

async function directProduction(method, path, body) {
  const query = new URLSearchParams(path.split('?')[1] || '')
  const cleanPath = path.split('?')[0]

  if (cleanPath === '/pwa-prod/my-shift' && method === 'GET') {
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

  if (cleanPath === '/pwa-prod/shift-summary' && method === 'GET') {
    const result = await odooHttp('GET', '/api/production/dashboard', {
      shift_id: query.get('shift_id') || '',
    })
    return result?.data || result
  }

  if (cleanPath === '/pwa-prod/checklist' && method === 'GET') {
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

  if (cleanPath === '/pwa-prod/checklist-check' && method === 'POST') {
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

  if (cleanPath === '/pwa-prod/checklist-complete' && method === 'POST') {
    return createUpdate({
      model: 'gf.haccp.checklist',
      method: 'function',
      ids: [Number(body?.checklist_id || 0)],
      function: 'action_complete',
      sudo: 1,
      app: 'pwa_colaboradores',
    })
  }

  if (cleanPath === '/pwa-prod/cycles' && method === 'GET') {
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

  if (cleanPath === '/pwa-prod/cycle-create' && method === 'POST') {
    const result = await odooHttp('POST', '/api/production/cycle/start', {}, {
      shift_id: Number(body?.shift_id || 0),
      machine_id: Number(body?.machine_id || 0),
    })
    return result?.data || result
  }

  if (cleanPath === '/pwa-prod/cycle-update' && method === 'POST') {
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

  if (cleanPath === '/pwa-prod/packing-products' && method === 'GET') {
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

  if (cleanPath === '/pwa-prod/packing-create' && method === 'POST') {
    const result = await odooHttp('POST', '/api/production/pack', {}, {
      shift_id: Number(body?.shift_id || 0),
      cycle_id: Number(body?.cycle_id || 0),
      product_id: Number(body?.product_id || 0),
      qty_bags: Number(body?.qty_bags || 0),
      production_order_id: Number(body?.production_order_id || 0),
    })
    return result?.data || result
  }

  if (cleanPath === '/pwa-prod/packing-entries' && method === 'GET') {
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

  if (cleanPath === '/pwa-prod/transformation-products' && method === 'GET') {
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

  if (cleanPath === '/pwa-prod/transformation-create' && method === 'POST') {
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

  if (cleanPath === '/pwa-prod/transformations' && method === 'GET') {
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

  // ── Downtime categories (gf.production.downtime.category) ─────────────────
  if (cleanPath === '/pwa-prod/downtime-categories' && method === 'GET') {
    const result = await readModelSorted('gf.production.downtime.category', {
      fields: ['id', 'name'],
      domain: [],
      sort_column: 'name',
      sort_desc: false,
      limit: 50,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  // ── Scrap reasons (gf.production.scrap.reason) ───────────────────────────
  if (cleanPath === '/pwa-prod/scrap-reasons' && method === 'GET') {
    const result = await readModelSorted('gf.production.scrap.reason', {
      fields: ['id', 'name'],
      domain: [],
      sort_column: 'name',
      sort_desc: false,
      limit: 50,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  // ── Register downtime (gf.production.downtime) ───────────────────────────
  if (cleanPath === '/pwa-prod/downtime-create' && method === 'POST') {
    return createUpdate({
      model: 'gf.production.downtime',
      method: 'create',
      dict: {
        shift_id: Number(body?.shift_id || 0),
        category_id: Number(body?.category_id || 0),
        operator_id: getEmployeeId() || Number(body?.operator_id || 0),
        reason: body?.reason || '',
        start_time: body?.start_time || false,
        end_time: body?.end_time || false,
        minutes: Number(body?.minutes || 0),
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
  }

  // ── Register scrap (gf.production.scrap) ─────────────────────────────────
  if (cleanPath === '/pwa-prod/scrap-create' && method === 'POST') {
    return createUpdate({
      model: 'gf.production.scrap',
      method: 'create',
      dict: {
        shift_id: Number(body?.shift_id || 0),
        reason_id: Number(body?.reason_id || 0),
        operator_id: getEmployeeId() || Number(body?.operator_id || 0),
        kg: Number(body?.kg || 0),
        notes: body?.notes || '',
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
  }

  // ── Bag reconciliation — update x_bags on shift ──────────────────────────
  if (cleanPath === '/pwa-prod/bag-reconciliation' && method === 'POST') {
    return createUpdate({
      model: 'gf.production.shift',
      method: 'update',
      ids: [Number(body?.shift_id || 0)],
      dict: {
        x_bags_received: Number(body?.bags_received || 0),
        x_bags_remaining: Number(body?.bags_remaining || 0),
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
  }

  // ── Close shift — try action_close, fallback to state write ──────────────
  if (cleanPath === '/pwa-prod/shift-close' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    try {
      return await createUpdate({
        model: 'gf.production.shift',
        method: 'function',
        ids: [shiftId],
        function: 'action_close',
        sudo: 1,
        app: 'pwa_colaboradores',
      })
    } catch (e) {
      // Fallback: write state directly if action_close not available
      if (e.message?.includes('action_close') || e.message?.includes('not found') || e.message?.includes('has no attribute')) {
        return createUpdate({
          model: 'gf.production.shift',
          method: 'update',
          ids: [shiftId],
          dict: { state: 'done' },
          sudo: 1,
          app: 'pwa_colaboradores',
        })
      }
      throw e
    }
  }

  // ── Barra: Harvest slot — proxy to Sebastián's controller ────────────────
  if (cleanPath === '/pwa-prod/harvest' && method === 'POST') {
    return odooJson('/api/ice/slot/harvest', {
      slot_id: Number(body?.slot_id || 0),
      qty: Number(body?.qty || 0),
      lot_name: body?.lot_name || '',
      operator_id: getEmployeeId() || Number(body?.operator_id || 0),
      temperature: Number(body?.temperature || 0),
    })
  }

  // ── Barra: Tank incident — proxy to Sebastián's controller ───────────────
  if (cleanPath === '/pwa-prod/tank-incident' && method === 'POST') {
    return odooJson('/api/ice/tank/incident', {
      machine_id: Number(body?.machine_id || 0),
      incident_type: body?.incident_type || '',
      description: body?.description || '',
      operator_id: getEmployeeId() || Number(body?.operator_id || 0),
    })
  }

  // ── Barra: Read machine salt level ───────────────────────────────────────
  if (cleanPath === '/pwa-prod/machine-salt' && method === 'GET') {
    const machineId = Number(query.get('machine_id') || 0)
    if (!machineId) return null
    const result = await readModel('gf.production.machine', {
      fields: ['id', 'name', 'x_salt_level', 'x_salt_level_updated_at', 'x_brine_temp_current'],
      domain: [['id', '=', machineId]],
      limit: 1,
      sudo: 1,
    })
    const machine = pickFirstResponse(result)
    if (!machine) return null
    return {
      id: machine.id,
      name: machine.name,
      salt_level: Number(machine.x_salt_level || 0),
      salt_level_updated_at: machine.x_salt_level_updated_at || null,
      brine_temp: Number(machine.x_brine_temp_current || 0),
    }
  }

  return NO_DIRECT
}

async function directRuta(method, path, body) {
  const query = new URLSearchParams(path.split('?')[1] || '')
  const cleanPath = path.split('?')[0]

  if (cleanPath === '/pwa-ruta/my-plan' && method === 'GET') {
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
        'departure_km',
        'arrival_km',
        'corte_validated',
        'corte_validated_at',
        'closure_time',
      ],
      domain: ['|', ['driver_employee_id', '=', empId], ['salesperson_employee_id', '=', empId]],
      sort_column: 'date',
      sort_desc: true,
      limit: 1,
      sudo: 1,
    })
    return pickFirstResponse(result)
  }

  if (cleanPath === '/pwa-ruta/my-target' && method === 'GET') {
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

  if (cleanPath === '/pwa-ruta/my-load' && method === 'GET') {
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

  if (cleanPath === '/pwa-ruta/load-lines' && method === 'GET') {
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

  if (cleanPath === '/pwa-ruta/reconciliation' && method === 'GET') {
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

  if (cleanPath === '/pwa-ruta/incident-create' && method === 'POST') {
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

  if (cleanPath === '/pwa-ruta/my-incidents' && method === 'GET') {
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

  // ── KM update — proxy to gf_logistics_ops controller ─────────────────────
  if (cleanPath === '/pwa-ruta/km-update' && method === 'POST') {
    return odooJson('/pwa-ruta/km-update', {
      plan_id: Number(body?.plan_id || 0),
      type: body?.type || '',
      km: Number(body?.km || 0),
    })
  }

  // ── Liquidation — proxy to gf_logistics_ops controller ───────────────────
  if (cleanPath === '/pwa-ruta/liquidation' && (method === 'GET' || method === 'POST')) {
    const planId = Number(query.get('plan_id') || body?.plan_id || 0)
    if (!planId) return null
    return odooJson('/pwa-ruta/liquidation', { plan_id: planId })
  }

  // ── Close route — proxy to gf_logistics_ops controller ───────────────────
  if (cleanPath === '/pwa-ruta/close-route' && method === 'POST') {
    return odooJson('/pwa-ruta/close-route', {
      plan_id: Number(body?.plan_id || 0),
      departure_km: Number(body?.departure_km || 0),
      arrival_km: Number(body?.arrival_km || 0),
    })
  }

  return NO_DIRECT
}

async function directSupervision(method, path, body) {
  const query = new URLSearchParams(path.split('?')[1] || '')
  const cleanPath = path.split('?')[0]
  const warehouseId = getWarehouseId()
  const companyId = getCompanyId()

  if (!cleanPath.startsWith('/pwa-sup/')) return NO_DIRECT

  if (cleanPath === '/pwa-sup/dashboard' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return null
    const result = await readModel('gf.production.shift', {
      fields: [
        'id', 'name', 'date', 'shift_code', 'state',
        'plant_warehouse_id', 'leader_employee_id',
        'total_kg_produced', 'total_kg_packed', 'total_downtime_min',
        'total_scrap_kg', 'energy_kwh', 'energy_kwh_per_kg',
        'yield_pct', 'x_compliance_score', 'x_meta_kg',
      ],
      domain: [['id', '=', shiftId]],
      limit: 1,
      sudo: 1,
    })
    return pickFirstResponse(result)
  }

  if (cleanPath === '/pwa-sup/operators' && method === 'GET') {
    const domain = [['x_job_key', 'in', ['operador_produccion', 'operador_empaque', 'operador_corte']]]
    if (warehouseId) domain.push(['warehouse_id', '=', warehouseId])
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('hr.employee', {
      fields: ['id', 'name', 'barcode', 'job_id', 'x_job_key', 'warehouse_id', 'company_id', 'image_128'],
      domain,
      sort_column: 'name',
      sort_desc: false,
      limit: 200,
      sudo: 1,
      file: 'url',
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      barcode: row.barcode || '',
      job_id: row.job_id,
      x_job_key: row.x_job_key || '',
      warehouse_id: row.warehouse_id?.[0] || 0,
      image_128: row.image_128 || false,
    }))
  }

  if (cleanPath === '/pwa-sup/active-shift' && method === 'GET') {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const domain = [['state', 'in', ['draft', 'in_progress']], ['date', '=', todayStr]]
    if (warehouseId) domain.push(['plant_warehouse_id', '=', warehouseId])
    const result = await readModelSorted('gf.production.shift', {
      fields: [
        'id', 'name', 'date', 'shift_code', 'state',
        'plant_warehouse_id', 'leader_employee_id', 'operator_employee_ids',
        'start_time', 'end_time',
        'total_kg_produced', 'total_kg_packed', 'total_downtime_min',
        'total_scrap_kg', 'energy_kwh', 'yield_pct',
        'x_compliance_score', 'x_meta_kg',
      ],
      domain,
      sort_column: 'id',
      sort_desc: true,
      limit: 1,
      sudo: 1,
    })
    return pickFirstResponse(result)
  }

  if (cleanPath === '/pwa-sup/shift-create' && method === 'POST') {
    const result = await createUpdate({
      model: 'gf.production.shift',
      method: 'create',
      dict: {
        date: body?.date || new Date().toISOString().slice(0, 10),
        shift_code: String(body?.shift_code || '1'),
        plant_warehouse_id: Number(body?.warehouse_id || warehouseId || 0) || undefined,
        leader_employee_id: Number(body?.leader_id || getEmployeeId() || 0) || undefined,
        operator_employee_ids: Array.isArray(body?.operator_ids)
          ? body.operator_ids.map((id) => [4, Number(id)])
          : [],
        state: 'draft',
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-sup/shift-close' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }
    const result = await createUpdate({
      model: 'gf.production.shift',
      method: 'update',
      ids: [shiftId],
      dict: {
        state: 'closed',
        end_time: body?.end_time || new Date().toISOString(),
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-sup/downtimes' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return []
    const result = await readModelSorted('gf.production.downtime', {
      fields: ['id', 'shift_id', 'category_id', 'machine_id', 'line_id', 'start_time', 'end_time', 'minutes', 'state', 'reason', 'operator_id'],
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'id',
      sort_desc: true,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  if (cleanPath === '/pwa-sup/downtime-categories' && method === 'GET') {
    const result = await readModelSorted('gf.production.downtime.category', {
      fields: ['id', 'name', 'code', 'is_planned'],
      domain: [],
      sort_column: 'name',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  if (cleanPath === '/pwa-sup/downtime-create' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }
    const result = await createUpdate({
      model: 'gf.production.downtime',
      method: 'create',
      dict: {
        shift_id: shiftId,
        category_id: Number(body?.category_id || 0) || undefined,
        machine_id: Number(body?.machine_id || 0) || undefined,
        line_id: Number(body?.line_id || 0) || undefined,
        start_time: body?.start_time || new Date().toISOString(),
        reason: body?.reason || body?.notes || '',
        operator_id: Number(body?.reported_by_id || getEmployeeId() || 0) || undefined,
        state: 'open',
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-sup/downtime-close' && method === 'POST') {
    const downtimeId = Number(body?.downtime_id || 0)
    if (!downtimeId) return { success: false, error: 'downtime_id requerido' }
    const result = await createUpdate({
      model: 'gf.production.downtime',
      method: 'update',
      ids: [downtimeId],
      dict: {
        state: 'closed',
        end_time: body?.end_time || new Date().toISOString(),
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-sup/scraps' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return []
    const result = await readModelSorted('gf.production.scrap', {
      fields: ['id', 'shift_id', 'product_id', 'kg', 'reason_id', 'notes', 'operator_id', 'line_id', 'machine_id', 'photo', 'timestamp', 'create_date'],
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'id',
      sort_desc: true,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  if (cleanPath === '/pwa-sup/scrap-reasons' && method === 'GET') {
    const result = await readModelSorted('gf.production.scrap.reason', {
      fields: ['id', 'name', 'code'],
      domain: [],
      sort_column: 'name',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  if (cleanPath === '/pwa-sup/scrap-create' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }
    const result = await createUpdate({
      model: 'gf.production.scrap',
      method: 'create',
      dict: {
        shift_id: shiftId,
        product_id: Number(body?.product_id || 0) || undefined,
        kg: Number(body?.kg || body?.qty_kg || 0),
        reason_id: Number(body?.reason_id || 0) || undefined,
        notes: body?.notes || '',
        operator_id: Number(body?.reported_by_id || getEmployeeId() || 0) || undefined,
        line_id: Number(body?.line_id || 0) || undefined,
        photo: body?.photo_base64 || undefined,
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-sup/energy' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return []
    const result = await readModelSorted('gf.energy.reading', {
      fields: ['id', 'shift_id', 'kwh_value', 'reading_type', 'timestamp', 'photo', 'employee_id'],
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'id',
      sort_desc: true,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  if (cleanPath === '/pwa-sup/energy-create' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }
    const result = await createUpdate({
      model: 'gf.energy.reading',
      method: 'create',
      dict: {
        shift_id: shiftId,
        kwh_value: Number(body?.kwh_value || body?.reading_kwh || 0),
        reading_type: body?.reading_type || undefined,
        timestamp: body?.timestamp || new Date().toISOString(),
        employee_id: Number(body?.employee_id || getEmployeeId() || 0) || undefined,
        photo: body?.photo_base64 || undefined,
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-sup/maintenance' && method === 'GET') {
    const domain = []
    if (warehouseId) domain.push(['warehouse_id', '=', warehouseId])
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('maintenance.request', {
      fields: ['id', 'name', 'request_date', 'stage_id', 'priority', 'equipment_id', 'maintenance_type', 'employee_id', 'description', 'schedule_date'],
      domain,
      sort_column: 'request_date',
      sort_desc: true,
      limit: 50,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  if (cleanPath === '/pwa-sup/maintenance-create' && method === 'POST') {
    const result = await createUpdate({
      model: 'maintenance.request',
      method: 'create',
      dict: {
        name: body?.name || body?.subject || 'Solicitud PWA',
        request_date: body?.request_date || new Date().toISOString().slice(0, 10),
        maintenance_type: body?.maintenance_type || body?.type || 'corrective',
        priority: body?.priority || '1',
        equipment_id: Number(body?.equipment_id || 0) || undefined,
        employee_id: Number(body?.employee_id || getEmployeeId() || 0) || undefined,
        description: body?.description || '',
        company_id: Number(body?.company_id || companyId || 0) || undefined,
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  return NO_DIRECT
}

async function directAlmacenPT(method, path, body) {
  const query = new URLSearchParams(path.split('?')[1] || '')
  const cleanPath = path.split('?')[0]
  const warehouseId = Number(query.get('warehouse_id') || 0) || getWarehouseId()
  const companyId = getCompanyId()

  if (!cleanPath.startsWith('/pwa-pt/')) return NO_DIRECT

  if (cleanPath === '/pwa-pt/pending-pallets' && method === 'GET') {
    const domain = [['status', '=', 'available'], ['received_by_id', '=', false]]
    if (warehouseId) domain.push(['warehouse_id', '=', warehouseId])
    const result = await readModelSorted('gf.pallet', {
      fields: ['id', 'name', 'product_id', 'qty', 'qty_kg', 'kg_total', 'status', 'shift_id', 'warehouse_id', 'created_by_id', 'layers', 'bags_per_layer', 'create_date'],
      domain,
      sort_column: 'create_date',
      sort_desc: true,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name || '',
      product: row.product_id?.[1] || '',
      product_id: row.product_id?.[0] || 0,
      qty: Number(row.qty || 0),
      kg_total: Number(row.kg_total || row.qty_kg || 0),
      shift: row.shift_id?.[1] || '',
      status: row.status || '',
      layers: Number(row.layers || 0),
      bags_per_layer: Number(row.bags_per_layer || 0),
      warehouse_id: row.warehouse_id?.[0] || warehouseId || 0,
      create_date: row.create_date || null,
    }))
  }

  if (cleanPath === '/pwa-pt/accept-pallet' && method === 'POST') {
    const palletId = Number(body?.pallet_id || 0)
    if (!palletId) return { success: false, error: 'pallet_id requerido' }
    const result = await createUpdate({
      model: 'gf.pallet',
      method: 'update',
      ids: [palletId],
      dict: {
        received_by_id: Number(body?.received_by_id || getEmployeeId() || 0) || undefined,
        status: 'available',
        received_at: new Date().toISOString(),
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-pt/reject-pallet' && method === 'POST') {
    const palletId = Number(body?.pallet_id || 0)
    if (!palletId) return { success: false, error: 'pallet_id requerido' }
    const result = await createUpdate({
      model: 'gf.pallet',
      method: 'update',
      ids: [palletId],
      dict: {
        status: 'hold',
        reject_reason: body?.reason || '',
        rejected_by_id: Number(body?.rejected_by_id || getEmployeeId() || 0) || undefined,
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-pt/inventory' && method === 'GET') {
    const domain = []
    if (warehouseId) domain.push(['warehouse_id', '=', warehouseId])
    const result = await readModelSorted('stock.quant', {
      fields: ['id', 'product_id', 'quantity', 'reserved_quantity', 'location_id', 'lot_id', 'warehouse_id'],
      domain,
      sort_column: 'product_id',
      sort_desc: false,
      limit: 500,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      product_id: row.product_id?.[0] || row.product_id,
      product: row.product_id?.[1] || '',
      product_name: row.product_id?.[1] || '',
      quantity: Number(row.quantity || 0),
      reserved: Number(row.reserved_quantity || 0),
      available: Number(row.quantity || 0) - Number(row.reserved_quantity || 0),
      location_id: row.location_id,
      lot_id: row.lot_id,
      warehouse_id: row.warehouse_id?.[0] || warehouseId || 0,
    }))
  }

  if (cleanPath === '/pwa-pt/ready-pallets' && method === 'GET') {
    const domain = [['status', '=', 'available'], ['received_by_id', '!=', false]]
    if (warehouseId) domain.push(['warehouse_id', '=', warehouseId])
    const result = await readModelSorted('gf.pallet', {
      fields: ['id', 'name', 'product_id', 'qty', 'qty_kg', 'kg_total', 'status', 'shift_id', 'warehouse_id', 'received_by_id', 'layers', 'bags_per_layer', 'create_date'],
      domain,
      sort_column: 'create_date',
      sort_desc: true,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name || '',
      product: row.product_id?.[1] || '',
      product_id: row.product_id?.[0] || 0,
      qty: Number(row.qty || 0),
      kg_total: Number(row.kg_total || row.qty_kg || 0),
      shift: row.shift_id?.[1] || '',
      status: row.status || '',
      layers: Number(row.layers || 0),
      bags_per_layer: Number(row.bags_per_layer || 0),
      warehouse_id: row.warehouse_id?.[0] || warehouseId || 0,
      create_date: row.create_date || null,
    }))
  }

  if (cleanPath === '/pwa-pt/cedis-list' && method === 'GET') {
    const result = await readModelSorted('stock.warehouse', {
      fields: ['id', 'name', 'code', 'company_id'],
      domain: [['name', 'ilike', 'CEDIS']],
      sort_column: 'name',
      sort_desc: false,
      limit: 50,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code || '',
      company_id: row.company_id?.[0] || 0,
    }))
  }

  if (cleanPath === '/pwa-pt/dispatch-create' && method === 'POST') {
    const palletIds = Array.isArray(body?.pallet_ids) ? body.pallet_ids.map(Number).filter(Boolean) : []
    if (!palletIds.length) return { success: false, error: 'pallet_ids requeridos' }
    const destWarehouseId = Number(body?.destination_warehouse_id || body?.cedis_id || 0)
    const promises = palletIds.map((id) =>
      createUpdate({
        model: 'gf.pallet',
        method: 'update',
        ids: [id],
        dict: {
          status: 'dispatched',
          dispatched_by_id: Number(body?.dispatched_by_id || getEmployeeId() || 0) || undefined,
          dispatched_at: new Date().toISOString(),
          destination_warehouse_id: destWarehouseId || undefined,
        },
        sudo: 1,
        app: 'pwa_colaboradores',
      })
    )
    await Promise.all(promises)
    return { success: true, dispatched: palletIds.length }
  }

  if (cleanPath === '/pwa-pt/dispatch-history' && method === 'GET') {
    const domain = [['picking_type_code', '=', 'internal']]
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('stock.picking', {
      fields: ['id', 'name', 'origin', 'state', 'scheduled_date', 'date_done', 'picking_type_id', 'location_id', 'location_dest_id', 'company_id'],
      domain,
      sort_column: 'scheduled_date',
      sort_desc: true,
      limit: 50,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      origin: row.location_id?.[1] || '',
      destination: row.location_dest_id?.[1] || '',
      state: row.state || '',
      date: row.date_done || row.scheduled_date || null,
      scheduled_date: row.scheduled_date || null,
      date_done: row.date_done || null,
    }))
  }

  // ── Dashboard summary (Sebastián commit fa20403) ──────────────────────────
  if (cleanPath === '/pwa-pt/dashboard-summary' && method === 'GET') {
    return odooJson('/api/pt/dashboard/summary', {
      warehouse_id: warehouseId,
      company_id: companyId || undefined,
    })
  }

  // ── Transfer orchestrate PT→CEDIS (Sebastián commit 16341c5) ─────────────
  if (cleanPath === '/pwa-pt/transfer-orchestrate' && method === 'POST') {
    return odooJson('/gf/salesops/pt/transfer/orchestrate', {
      warehouse_id: body?.warehouse_id || warehouseId,
      cedis_id: body?.cedis_id || 0,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      lines: body?.lines || [],
      notes: body?.notes || '',
    })
  }

  // ── Shift handover for PT (Sebastián commit a3f58c0) ─────────────────────
  if (cleanPath === '/pwa-pt/shift-handover-create' && method === 'POST') {
    return odooJson('/gf/logistics/api/employee/shift_handover/create', {
      warehouse_id: body?.warehouse_id || warehouseId,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      lines: body?.lines || [],
      notes: body?.notes || '',
    })
  }

  if (cleanPath === '/pwa-pt/shift-handover-pending' && method === 'GET') {
    return odooJson('/gf/logistics/api/employee/shift_handover/pending', {
      warehouse_id: warehouseId,
    })
  }

  if (cleanPath === '/pwa-pt/shift-handover-accept' && method === 'POST') {
    return odooJson('/gf/logistics/api/employee/shift_handover/accept', {
      handover_id: body?.handover_id || 0,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      lines: body?.lines || [],
      notes: body?.notes || '',
      action: body?.action || 'accept',
    })
  }

  // ── Scrap for PT (reuses entregas warehouse_scrap endpoint) ──────────────
  if (cleanPath === '/pwa-pt/scrap-create' && method === 'POST') {
    return odooJson('/gf/logistics/api/employee/warehouse_scrap/create', {
      warehouse_id: body?.warehouse_id || warehouseId,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      product_id: body?.product_id || 0,
      scrap_qty: body?.scrap_qty || body?.qty || 0,
      reason_tag: body?.reason_tag || '',
      notes: body?.notes || '',
      lot_id: body?.lot_id || null,
    })
  }

  if (cleanPath === '/pwa-pt/scrap-history' && method === 'GET') {
    return odooJson('/gf/logistics/api/employee/warehouse_scrap/history', {
      warehouse_id: warehouseId,
    })
  }

  // ── Scrap reasons PT (Sebastián commit 56c064e — production catalog) ─────
  if (cleanPath === '/pwa-pt/scrap-reasons' && method === 'GET') {
    const result = await readModelSorted('gf.production.scrap.reason', {
      fields: ['id', 'name'],
      domain: [],
      sort_column: 'name',
      sort_desc: false,
      limit: 50,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  // ── Reception (Sebastián rollout 2026-04-10) ─────────────────────────────
  // Backend: gf_production_ops/controllers/gf_production_api.py
  //   Split buckets: pending_posting vs pending_receipt
  //   Architectural: reception stays on gf.packing.entry, no duplicate
  //   stock.move, inventory posting via gf.inventory.posting only.
  if (cleanPath === '/pwa-pt/reception-pending' && method === 'GET') {
    return odooJson('/api/pt/reception/pending', {
      warehouse_id: warehouseId,
      company_id: companyId || undefined,
    })
  }

  if (cleanPath === '/pwa-pt/reception-create' && method === 'POST') {
    return odooJson('/api/pt/reception/create', {
      warehouse_id: body?.warehouse_id || warehouseId,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      packing_entry_id: body?.packing_entry_id || undefined,
      product_id: body?.product_id || undefined,
      qty_reported: body?.qty_reported != null ? Number(body.qty_reported) : undefined,
      qty_received: body?.qty_received != null ? Number(body.qty_received) : undefined,
      difference: body?.difference != null ? Number(body.difference) : undefined,
      difference_pct: body?.difference_pct != null ? Number(body.difference_pct) : undefined,
      notes: body?.notes || '',
      lines: body?.lines || undefined,
    })
  }

  // ── Transformation (Sebastián rollout 2026-04-10) ────────────────────────
  // Backend: uses existing gf.transformation.order model (no new model).
  if (cleanPath === '/pwa-pt/transformation-pending' && method === 'GET') {
    return odooJson('/api/pt/transformation/pending', {
      warehouse_id: warehouseId,
      company_id: companyId || undefined,
    })
  }

  if (cleanPath === '/pwa-pt/transformation-create' && method === 'POST') {
    return odooJson('/api/pt/transformation/create', {
      warehouse_id: body?.warehouse_id || warehouseId,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      from_product_id: body?.from_product_id || undefined,
      to_product_id: body?.to_product_id || undefined,
      qty: body?.qty != null ? Number(body.qty) : undefined,
      notes: body?.notes || '',
      lines: body?.lines || undefined,
    })
  }

  // ── Forecast requests (Sebastián rollout 2026-04-10, gf_saleops) ─────────
  // Backend: gf_saleops/controllers/pt.py
  //   Warehouse → analytic resolution.
  //   Scope precedence: employee > branch > global.
  //   Uses existing gf.saleops.forecast, line aggregation.
  if (cleanPath === '/pwa-pt/forecast-pending' && method === 'GET') {
    return odooJson('/api/pt/forecast/pending', {
      warehouse_id: warehouseId,
      employee_id: Number(query.get('employee_id') || 0) || getEmployeeId() || undefined,
      company_id: companyId || undefined,
    })
  }

  // ── Day sales by employee (Sebastián audit 2026-04-10) ──────────────────
  // Backend: gf_saleops/controllers/pt.py → GET /api/pt/day-sales
  // Expone sales_qty_by_employee_for_day() como HTTP endpoint.
  // Response: { ok, data: { date, warehouse_id, items: [{employee_id, employee_name, qty_total, ...}] } }
  if (cleanPath === '/pwa-pt/day-sales' && method === 'GET') {
    return odooJson('/api/pt/day-sales', {
      warehouse_id: warehouseId,
      date: query.get('date') || undefined,
      company_id: companyId || undefined,
    })
  }

  // ── Transfers history PT→CEDIS (Sebastián audit 2026-04-10) ─────────────
  // Backend: gf_logistics_ops/controllers/pt.py → GET /api/pt/transfers/history
  // Historial de stock.picking para transferencias PT→CEDIS.
  // Response: { ok, data: { items: [{id, name, state, date, origin, destination, lines}], total } }
  if (cleanPath === '/pwa-pt/transfers-history' && method === 'GET') {
    return odooJson('/api/pt/transfers/history', {
      warehouse_id: warehouseId,
      date_from: query.get('date_from') || undefined,
      date_to: query.get('date_to') || undefined,
      limit: Number(query.get('limit') || 50),
      offset: Number(query.get('offset') || 0),
      company_id: companyId || undefined,
    })
  }

  return NO_DIRECT
}

async function directEntregas(method, path, body) {
  const query = new URLSearchParams(path.split('?')[1] || '')
  const cleanPath = path.split('?')[0]
  const companyId = getCompanyId()
  const warehouseId = Number(query.get('warehouse_id') || 0) || getWarehouseId()

  if (!cleanPath.startsWith('/pwa-entregas/')) return NO_DIRECT

  if (cleanPath === '/pwa-entregas/today-routes' && method === 'GET') {
    const today = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    const domain = [['date', '=', todayStr]]
    if (companyId) domain.push(['company_id', '=', companyId])
    if (warehouseId) domain.push(['warehouse_id', '=', warehouseId])
    const result = await readModelSorted('gf.route.plan', {
      fields: [
        'id', 'name', 'date', 'route_id', 'state',
        'driver_employee_id', 'salesperson_employee_id',
        'stops_total', 'stops_done',
        'load_picking_id', 'load_sealed',
        'departure_time_target', 'departure_time_real',
      ],
      domain,
      sort_column: 'name',
      sort_desc: false,
      limit: 100,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      date: row.date,
      route_id: row.route_id,
      state: row.state,
      driver: row.driver_employee_id?.[1] || '',
      salesperson: row.salesperson_employee_id?.[1] || '',
      stops_total: Number(row.stops_total || 0),
      stops_done: Number(row.stops_done || 0),
      load_sealed: row.load_sealed === true,
      departure_target: row.departure_time_target || null,
      departure_real: row.departure_time_real || null,
    }))
  }

  if (cleanPath === '/pwa-entregas/confirm-load' && method === 'POST') {
    const routePlanId = Number(body?.route_plan_id || 0)
    if (!routePlanId) return { success: false, error: 'route_plan_id requerido' }
    const result = await createUpdate({
      model: 'gf.route.plan',
      method: 'update',
      ids: [routePlanId],
      dict: {
        load_sealed: true,
        load_sealed_by_id: Number(body?.sealed_by_id || getEmployeeId() || 0) || undefined,
        load_sealed_at: new Date().toISOString(),
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-entregas/returns' && method === 'GET') {
    const routePlanId = Number(query.get('route_plan_id') || 0)
    const domain = [['line_type', 'in', ['return', 'scrap']]]
    if (routePlanId) domain.push(['route_plan_id', '=', routePlanId])
    if (companyId) domain.push(['company_id', '=', companyId])
    if (warehouseId) domain.push(['warehouse_id', '=', warehouseId])
    const result = await readModelSorted('gf.route.stop.line', {
      fields: ['id', 'route_plan_id', 'stop_id', 'product_id', 'qty', 'line_type', 'reason', 'notes', 'create_date',
        'received_by_id', 'received_at', 'received_qty', 'reception_state', 'reception_notes'],
      domain,
      sort_column: 'create_date',
      sort_desc: true,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      route_plan_id: row.route_plan_id?.[0] || row.route_plan_id || null,
      route: row.route_plan_id?.[1] || '',
      stop_id: row.stop_id?.[0] || row.stop_id || null,
      product_id: row.product_id?.[0] || row.product_id || null,
      product: row.product_id?.[1] || '',
      quantity: Number(row.qty || 0),
      line_type: row.line_type || null,
      reason: row.reason || '',
      notes: row.notes || '',
      create_date: row.create_date || '',
      // Reception fields (from Sebastián's gf_logistics_ops extension)
      received_by_id: row.received_by_id?.[0] || null,
      received_by: row.received_by_id?.[1] || '',
      received_at: row.received_at || null,
      received_qty: row.received_qty != null ? Number(row.received_qty) : null,
      reception_state: row.reception_state || 'pending',
      reception_notes: row.reception_notes || '',
      state: row.reception_state === 'received' || row.reception_state === 'received_with_diff' ? 'done' : 'pending',
    }))
  }

  // ── Sebastián's gf_logistics_ops endpoints ────────────────────────────────

  if (cleanPath === '/pwa-entregas/day-summary' && method === 'GET') {
    return odooJson('/gf/logistics/api/employee/entregas/day_summary', {
      warehouse_id: warehouseId,
    })
  }

  if (cleanPath === '/pwa-entregas/return-accept' && method === 'POST') {
    return odooJson('/gf/logistics/api/employee/route_return/accept', {
      stop_line_ids: body?.stop_line_ids || [],
      employee_id: body?.employee_id || getEmployeeId() || 0,
      warehouse_id: body?.warehouse_id || warehouseId,
      lines: body?.lines || [],
    })
  }

  if (cleanPath === '/pwa-entregas/scrap-create' && method === 'POST') {
    return odooJson('/gf/logistics/api/employee/warehouse_scrap/create', {
      warehouse_id: body?.warehouse_id || warehouseId,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      product_id: body?.product_id || 0,
      scrap_qty: body?.scrap_qty || body?.qty || 0,
      reason_tag: body?.reason_tag || '',
      notes: body?.notes || '',
      lot_id: body?.lot_id || null,
    })
  }

  if (cleanPath === '/pwa-entregas/scrap-history' && method === 'GET') {
    return odooJson('/gf/logistics/api/employee/warehouse_scrap/history', {
      warehouse_id: warehouseId,
    })
  }

  if (cleanPath === '/pwa-entregas/shift-handover-create' && method === 'POST') {
    return odooJson('/gf/logistics/api/employee/shift_handover/create', {
      warehouse_id: body?.warehouse_id || warehouseId,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      lines: body?.lines || [],
      notes: body?.notes || '',
    })
  }

  if (cleanPath === '/pwa-entregas/shift-handover-pending' && method === 'GET') {
    return odooJson('/gf/logistics/api/employee/shift_handover/pending', {
      warehouse_id: warehouseId,
    })
  }

  if (cleanPath === '/pwa-entregas/shift-handover-accept' && method === 'POST') {
    return odooJson('/gf/logistics/api/employee/shift_handover/accept', {
      handover_id: body?.handover_id || 0,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      lines: body?.lines || [],
      notes: body?.notes || '',
      action: body?.action || 'accept',
    })
  }

  return NO_DIRECT
}

async function directSupervisorVentas(method, path, body) {
  const query = new URLSearchParams(path.split('?')[1] || '')
  const cleanPath = path.split('?')[0]
  const companyId = getCompanyId()

  if (!cleanPath.startsWith('/pwa-supv/')) return NO_DIRECT

  if (cleanPath === '/pwa-supv/team' && method === 'GET') {
    const domain = [['x_job_key', 'in', ['jefe_ruta', 'auxiliar_ruta']]]
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('hr.employee', {
      fields: ['id', 'name', 'barcode', 'job_id', 'x_job_key', 'warehouse_id', 'company_id', 'image_128', 'work_phone', 'mobile_phone'],
      domain,
      sort_column: 'name',
      sort_desc: false,
      limit: 200,
      sudo: 1,
      file: 'url',
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      barcode: row.barcode || '',
      job_id: row.job_id,
      x_job_key: row.x_job_key || '',
      warehouse_id: row.warehouse_id?.[0] || 0,
      image_128: row.image_128 || false,
      phone: row.work_phone || row.mobile_phone || '',
    }))
  }

  if (cleanPath === '/pwa-supv/team-routes' && method === 'GET') {
    const pad = (n) => String(n).padStart(2, '0')
    // Accept optional ?date=YYYY-MM-DD param, default to today
    const dateParam = query.get('date')
    let dateStr
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      dateStr = dateParam
    } else {
      const today = new Date()
      dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    }
    const domain = [['date', '=', dateStr]]
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('gf.route.plan', {
      fields: [
        'id', 'name', 'date', 'route_id', 'state',
        'driver_employee_id', 'salesperson_employee_id',
        'stops_total', 'stops_done',
        'load_sealed', 'departure_time_target', 'departure_time_real', 'departure_on_time',
        'closure_time', 'reconciliation_id', 'force_close_reason',
        'delivery_effectiveness_pct', 'progress_pct',
        'bridge_key',
      ],
      domain,
      sort_column: 'name',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => {
      const stopsTotal = Number(row.stops_total || 0)
      const stopsDone = Number(row.stops_done || 0)
      return {
        id: row.id,
        name: row.name,
        date: row.date,
        route_id: row.route_id,
        state: row.state,
        driver_id: row.driver_employee_id?.[0] || 0,
        driver: row.driver_employee_id?.[1] || '',
        salesperson_id: row.salesperson_employee_id?.[0] || 0,
        salesperson: row.salesperson_employee_id?.[1] || '',
        stops_total: stopsTotal,
        stops_done: stopsDone,
        progress: stopsTotal > 0 ? Math.round((stopsDone / stopsTotal) * 100) : 0,
        effectiveness: Number(row.delivery_effectiveness_pct || 0),
        load_sealed: row.load_sealed === true,
        departure_target: row.departure_time_target || null,
        departure_real: row.departure_time_real || null,
        departure_on_time: row.departure_on_time === true,
        closure_time: row.closure_time || null,
        reconciliation_id: row.reconciliation_id?.[0] || null,
        reconciliation_name: row.reconciliation_id?.[1] || '',
        force_close_reason: row.force_close_reason || null,
      }
    })
  }

  if (cleanPath === '/pwa-supv/forecast-products' && method === 'GET') {
    const result = await readModelSorted('product.product', {
      fields: ['id', 'name', 'list_price', 'weight', 'sale_ok', 'barcode'],
      domain: [['sale_ok', '=', true], ['list_price', '>', 0]],
      sort_column: 'name',
      sort_desc: false,
      limit: 500,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.list_price || 0),
      weight: Number(row.weight || 0),
      barcode: row.barcode || '',
    }))
  }

  if (cleanPath === '/pwa-supv/forecast-create' && method === 'POST') {
    // employee_id: si se pasa, el forecast es per-vendor.
    // Si no, es global de sucursal (created_by queda como referencia).
    const employeeId = Number(body?.employee_id || 0)
    const dict = {
      name: body?.name || `Pronóstico ${new Date().toISOString().slice(0, 10)}`,
      date_target: body?.date_target || new Date().toISOString().slice(0, 10),
      created_by_employee_id: Number(employeeId || getEmployeeId() || 0) || undefined,
      company_id: Number(body?.company_id || companyId || 0) || undefined,
      analytic_account_id: Number(body?.analytic_account_id || body?.sucursal || 0) || undefined,
      state: 'draft',
      line_ids: Array.isArray(body?.lines)
        ? body.lines
            .filter((l) => l?.product_id && l?.qty)
            .map((l) => [0, 0, {
              product_id: Number(l.product_id),
              qty: Number(l.qty || 0),
              channel: l.channel || undefined,
            }])
        : [],
    }
    // SCOPE: Si employee_id tiene campo propio en el modelo (spec § 3.1),
    // asignarlo. Si no existe en Odoo, Odoo lo ignora silenciosamente.
    if (employeeId) dict.employee_id = employeeId
    const result = await createUpdate({
      model: 'gf.saleops.forecast',
      method: 'create',
      dict,
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-supv/forecasts' && method === 'GET') {
    const domain = []
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('gf.saleops.forecast', {
      fields: ['id', 'name', 'date_target', 'state', 'company_id', 'analytic_account_id', 'created_by_employee_id', 'confirmed_by_employee_id', 'confirmed_at'],
      domain,
      sort_column: 'date_target',
      sort_desc: true,
      limit: 50,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  if (cleanPath === '/pwa-supv/forecast-confirm' && method === 'POST') {
    const forecastId = Number(body?.forecast_id || 0)
    if (!forecastId) return { success: false, error: 'forecast_id requerido' }
    return odooJson('/gf/salesops/supervisor/v2/forecast/confirm', {
      forecast_id: forecastId,
    })
  }

  if (cleanPath === '/pwa-supv/forecast-cancel' && method === 'POST') {
    const forecastId = Number(body?.forecast_id || 0)
    if (!forecastId) return { success: false, error: 'forecast_id requerido' }
    return odooJson('/gf/salesops/supervisor/v2/forecast/cancel', {
      forecast_id: forecastId,
    })
  }

  if (cleanPath === '/pwa-supv/team-targets' && method === 'GET') {
    const [startMonth, endMonth] = monthRange()
    const domain = [['target_month', '>=', startMonth], ['target_month', '<', endMonth]]
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('hr.employee.monthly.target', {
      fields: ['id', 'employee_id', 'target_month', 'sales_target', 'collection_target', 'actual_sales', 'actual_collection'],
      domain,
      sort_column: 'employee_id',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      employee_id: row.employee_id,
      employee_name: row.employee_id?.[1] || '',
      target_month: row.target_month,
      sales_target: Number(row.sales_target || 0),
      collection_target: Number(row.collection_target || 0),
      sales_actual: Number(row.actual_sales || 0),
      collection_actual: Number(row.actual_collection || 0),
    }))
  }

  if (cleanPath === '/pwa-supv/kpi-snapshots' && method === 'GET') {
    const sucursalId = Number(query.get('sucursal_id') || 0)
    const [startMonth, endMonth] = monthRange()
    const domain = [['date_kpi', '>=', startMonth], ['date_kpi', '<', endMonth]]
    if (companyId) domain.push(['company_id', '=', companyId])
    if (sucursalId) domain.push(['analytic_account_id', '=', sucursalId])
    const result = await readModelSorted('gf.saleops.kpi.snapshot', {
      fields: ['id', 'date_kpi', 'analytic_account_id', 'company_id', 'sales_qty', 'forecast_qty', 'pt_available_qty', 'en_available_qty', 'vans_available_qty'],
      domain,
      sort_column: 'date_kpi',
      sort_desc: true,
      limit: 50,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  // ── Route Stops (detalle de paradas de una ruta) ──
  if (cleanPath === '/pwa-supv/route-stops' && method === 'GET') {
    const routePlanId = Number(query.get('route_plan_id') || 0)
    if (!routePlanId) return []
    const result = await readModelSorted('gf.route.stop', {
      fields: [
        'id', 'route_plan_id', 'customer_id', 'state', 'result_status',
        'not_visited_reason_id', 'actual_start_time', 'actual_end_time',
        'visit_duration_min', 'sale_order_ids', 'sale_order_count',
        'comments', 'route_sequence', 'checkin_latitude', 'checkin_longitude',
      ],
      domain: [['route_plan_id', '=', routePlanId]],
      sort_column: 'route_sequence',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      route_plan_id: row.route_plan_id?.[0] || routePlanId,
      customer_id: row.customer_id?.[0] || 0,
      customer: row.customer_id?.[1] || '',
      state: row.state || '',
      result_status: row.result_status || '',
      not_visited_reason: row.not_visited_reason_id?.[1] || '',
      start_time: row.actual_start_time || null,
      end_time: row.actual_end_time || null,
      duration_min: Number(row.visit_duration_min || 0),
      sales_count: Number(row.sale_order_count || 0),
      comments: row.comments || '',
      sequence: Number(row.route_sequence || 0),
      has_checkin: !!(row.checkin_latitude || row.checkin_longitude),
    }))
  }

  // ── Week Routes (rutas lunes a domingo para score semanal) ──
  if (cleanPath === '/pwa-supv/week-routes' && method === 'GET') {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const pad = (n) => String(n).padStart(2, '0')
    const monStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
    const sunStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`

    const domain = [['date', '>=', monStr], ['date', '<=', sunStr]]
    if (companyId) domain.push(['company_id', '=', companyId])

    const result = await readModelSorted('gf.route.plan', {
      fields: [
        'id', 'name', 'date', 'route_id', 'state',
        'driver_employee_id', 'salesperson_employee_id',
        'stops_total', 'stops_done', 'progress_pct',
        'delivery_effectiveness_pct',
      ],
      domain,
      sort_column: 'date',
      sort_desc: false,
      limit: 500,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name,
      date: row.date,
      state: row.state,
      driver_id: row.driver_employee_id?.[0] || 0,
      driver: row.driver_employee_id?.[1] || '',
      salesperson_id: row.salesperson_employee_id?.[0] || 0,
      salesperson: row.salesperson_employee_id?.[1] || '',
      stops_total: Number(row.stops_total || 0),
      stops_done: Number(row.stops_done || 0),
      progress: Number(row.progress_pct || 0),
      effectiveness: Number(row.delivery_effectiveness_pct || 0),
    }))
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
    directSupervision,
    directAlmacenPT,
    directEntregas,
    directSupervisorVentas,
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
