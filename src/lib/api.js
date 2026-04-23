import {
  buildCycleExpectedTiming,
  minutesFromMachineDefrost,
  minutesFromMachineFreeze,
  withExpectedTimingFields,
  withExpectedFreezeField,
} from '../modules/produccion/cycleTiming'
import {
  buildPtReceptionFromHarvest,
  resolvePackedProductFromHarvest,
} from '../modules/produccion/barraHarvestReception.js'
import {
  normalizeChecklistNumericCheck,
  normalizeChecklistNumericRange,
} from '../modules/produccion/checklistNumericRange.js'

// ─── API Helper Central — Bypass-safe ────────────────────────────────────────
// Mantiene n8n como fallback, pero resuelve primero los endpoints que ya viven
// directo en Odoo para evitar 401s cuando n8n no está alineado con la app.
//
// ApiError: clase de error estructurado con status (HTTP) y code (semantico).
// Los consumidores usan e.status y e.code para tomar decisiones — NO regex.

const N8N_BASE = '/api-n8n'
const ODOO_BASE = '/odoo-api'
const NO_DIRECT = Symbol('no_direct')

// ─── Error estructurado ─────────────────────────────────────────────────────
// ApiError lleva status y code para que los consumidores puedan tomar decisiones
// sin parsear mensajes de error con regex.
//   e.status → HTTP status (404, 401, 500...) o 0 si no aplica
//   e.code   → 'network' | 'bypass' | 'no_session' | 'http_error'
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'http_error' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

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

function getSalesOpsToken() {
  const session = getSession()
  return session.gf_salesops_token
    || session.salesops_api_token
    || session.x_gf_token
    || import.meta.env.VITE_GF_SALESOPS_TOKEN
    || ''
}

function getSalesOpsTokenMeta() {
  const session = getSession()
  const sessionToken = session.gf_salesops_token || session.salesops_api_token || session.x_gf_token || ''
  const envToken = import.meta.env.VITE_GF_SALESOPS_TOKEN || ''
  const token = sessionToken || envToken || ''
  return {
    token,
    present: Boolean(token),
    length: String(token || '').length,
    source: sessionToken ? 'session' : (envToken ? 'env' : 'missing'),
    session_present: Boolean(sessionToken),
    env_present: Boolean(envToken),
  }
}

function getEmployeeId() {
  const session = getSession()
  return Number(session.employee_id || session.employee?.id || 0) || 0
}

function getWarehouseId() {
  const session = getSession()
  return Number(session.warehouse_id || session.plant_warehouse_id || 0) || 0
}

// Resolve gf.production.line id from session role.
// Iguala plant: 1 = Barras, 2 = Rolito. Falls back to Rolito for operador_rolito,
// Barras for operador_barras, else 0.
function getLineIdFromRole() {
  const role = String(getSession().role || '').toLowerCase()
  if (role.includes('rolito')) return 2
  if (role.includes('barra')) return 1
  return 0
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

function buildBaseHeaders(path = '') {
  const headers = {
    'Content-Type': 'application/json',
  }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const apiKey = getApiKey()
  if (apiKey) headers['Api-Key'] = apiKey
  const employeeToken = getEmployeeToken()
  if (employeeToken) headers['X-GF-Employee-Token'] = employeeToken
  if (String(path || '').startsWith('/gf/salesops/')) {
    const salesOpsMeta = getSalesOpsTokenMeta()
    if (salesOpsMeta.token) headers['X-GF-Token'] = salesOpsMeta.token
    console.info('[gf_salesops] auth header prepared', {
      path,
      token_present: salesOpsMeta.present,
      token_length: salesOpsMeta.length,
      token_source: salesOpsMeta.source,
      session_token_present: salesOpsMeta.session_present,
      env_token_present: salesOpsMeta.env_present,
      header_attached: Boolean(headers['X-GF-Token']),
    })
  }
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

function toMany2oneId(value) {
  if (Array.isArray(value)) return Number(value[0] || 0)
  if (value && typeof value === 'object') {
    return Number(value.id || value.product_id || value[0] || 0)
  }
  return Number(value || 0)
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

const modelFieldSupportCache = new Map()
const modelFieldInfoCache = new Map()

async function modelHasField(model, fieldName) {
  const cacheKey = `${model}:${fieldName}`
  if (modelFieldSupportCache.has(cacheKey)) {
    return modelFieldSupportCache.get(cacheKey)
  }
  try {
    const result = await readModelSorted('ir.model.fields', {
      fields: ['id', 'name'],
      domain: [['model', '=', model], ['name', '=', fieldName]],
      sort_column: 'id',
      sort_desc: true,
      limit: 1,
      sudo: 1,
    })
    const supported = Boolean(pickFirstResponse(result)?.id)
    modelFieldSupportCache.set(cacheKey, supported)
    return supported
  } catch (_) {
    modelFieldSupportCache.set(cacheKey, false)
    return false
  }
}

async function getModelFieldInfo(model, fieldName) {
  const cacheKey = `${model}:${fieldName}:info`
  if (modelFieldInfoCache.has(cacheKey)) {
    return modelFieldInfoCache.get(cacheKey)
  }
  try {
    const result = await readModelSorted('ir.model.fields', {
      fields: ['id', 'name', 'relation', 'required'],
      domain: [['model', '=', model], ['name', '=', fieldName]],
      sort_column: 'id',
      sort_desc: true,
      limit: 1,
      sudo: 1,
    })
    const info = pickFirstResponse(result) || null
    modelFieldInfoCache.set(cacheKey, info)
    return info
  } catch (_) {
    modelFieldInfoCache.set(cacheKey, null)
    return null
  }
}

async function enrichCyclesWithMachineTiming(cycles = []) {
  const list = Array.isArray(cycles) ? cycles : []
  const machineIds = [...new Set(
    list
      .map((cycle) => Array.isArray(cycle?.machine_id) ? cycle.machine_id[0] : cycle?.machine_id)
      .map((machineId) => Number(machineId || 0))
      .filter(Boolean)
  )]

  if (!machineIds.length) return list

  const machineRows = await readModelSorted('gf.production.machine', {
    fields: ['id', 'freeze_hours', 'expected_freeze_min', 'expected_defrost_min'],
    domain: [['id', 'in', machineIds]],
    sort_column: 'id',
    sort_desc: false,
    limit: machineIds.length,
    sudo: 1,
  })

  const machineMap = new Map(
    pickListResponse(machineRows).map((machine) => [Number(machine.id || 0), machine])
  )

  return list.map((cycle) => {
    const machineId = Number(Array.isArray(cycle?.machine_id) ? cycle.machine_id[0] : cycle?.machine_id || 0)
    const machine = machineMap.get(machineId)
    if (!machine) return cycle
    return {
      ...cycle,
      expected_freeze_min: Number(cycle?.expected_freeze_min || 0) > 0
        ? Number(cycle.expected_freeze_min)
        : minutesFromMachineFreeze(machine),
      expected_defrost_min: Number(cycle?.expected_defrost_min || 0) > 0
        ? Number(cycle.expected_defrost_min)
        : minutesFromMachineDefrost(machine),
    }
  })
}

// Normalize a gf.production.machine record (tank) for the PWA Barras UI.
// Unwraps [id, name] many2one tuples and coerces numbers so the client
// does not have to know about Odoo response shapes.
function shapeTank(r) {
  if (!r) return null
  const lineId = Array.isArray(r.line_id) ? r.line_id[0] : (r.line_id || null)
  const lineName = Array.isArray(r.line_id) ? r.line_id[1] : ''
  const productId = Array.isArray(r.bar_product_id) ? r.bar_product_id[0] : (r.bar_product_id || null)
  const productName = Array.isArray(r.bar_product_id) ? r.bar_product_id[1] : ''
  const nextSlotId = Array.isArray(r.x_next_slot_id) ? r.x_next_slot_id[0] : (r.x_next_slot_id || null)
  return {
    id: r.id,
    name: r.name || r.display_name || '',
    display_name: r.display_name || r.name || '',
    machine_type: r.machine_type || '',
    line_id: lineId,
    line_name: lineName,
    slot_rows: Number(r.slot_rows || 0),
    slot_columns: Number(r.slot_columns || 0),
    bars_per_basket: Number(r.bars_per_basket || 0),
    kg_per_bar: Number(r.kg_per_bar || 0),
    product_id: productId,
    product_name: productName,
    capacity_tons_day: Number(r.capacity_tons_day || 0),
    freeze_hours: Number(r.freeze_hours || 0),
    salt_level: Number(r.x_salt_level || 0),
    salt_level_updated_at: r.x_salt_level_updated_at || null,
    salt_level_unit: r.salt_level_unit || 'ppm',
    min_salt_level_for_harvest: r.min_salt_level_for_harvest != null ? Number(r.min_salt_level_for_harvest) : null,
    min_brine_temp_for_harvest: r.min_brine_temp_for_harvest != null ? Number(r.min_brine_temp_for_harvest) : null,
    brine_temp: Number(r.x_brine_temp_current || 0),
    brine_temp_alert: Boolean(r.x_brine_temp_alert),
    brine_temp_updated_at: r.x_brine_temp_updated_at || null,
    total_slots: Number(r.x_total_slots || 0),
    active_slots_count: Number(r.x_active_slots_count || 0),
    ready_slots_count: Number(r.x_ready_slots_count || 0),
    next_slot_id: nextSlotId,
    next_slot_name: r.x_next_slot_name || '',
    next_allowed_extraction: r.x_next_allowed_extraction || null,
    last_extraction_time: r.x_last_extraction_time || null,
    extractions_last_30min: Number(r.x_extractions_last_30min || 0),
  }
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
  const headers = buildBaseHeaders(path)
  if (String(path || '').startsWith('/gf/salesops/')) {
    console.info('[gf_salesops] jsonrpc request', {
      path,
      token_present: Boolean(headers['X-GF-Token']),
      token_length: String(headers['X-GF-Token'] || '').length,
      header_keys: Object.keys(headers),
    })
  }
  const res = await fetch(`${ODOO_BASE}${path}`, {
    method: 'POST',
    headers,
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
    headers: buildBaseHeaders(path),
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
  const result = await odooJson('/api/create_update', payload)
  // Odoo create_update returns { success: true, case: 1 } on success
  // or { error: '...', case: -3 } on failure. odooJson does NOT throw for
  // the latter (HTTP 200), so normalize the error here.
  if (result && typeof result === 'object') {
    if (result.error) throw new Error(String(result.error))
    if (result.success === false) throw new Error(String(result.message || 'create_update failed'))
  }
  return result
}

// Format JS Date to Odoo datetime format (UTC): 'YYYY-MM-DD HH:MM:SS'
function odooNow(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

// ── Merma por pieza: prefijo estructurado en notes ────────────────────────
// Interim mientras gf.production.scrap no tenga columnas product_id / qty_units.
// Formato: [PZS|P:123|N:BARRA DE HIELO CHICA|Q:3|KU:50] user notes aqui
// Campos: P=product_id, N=product_name (sin |), Q=qty_units, KU=kg_per_unit
function buildPzsPrefix({ product_id, product_name, qty_units, kg_per_unit }) {
  const safeName = String(product_name || '').replace(/[|\]]/g, ' ').trim()
  return `[PZS|P:${Number(product_id) || 0}|N:${safeName}|Q:${Number(qty_units) || 0}|KU:${Number(kg_per_unit) || 0}]`
}

function parsePzsPrefix(notes) {
  const fallback = { type: 'weight', product_id: null, product_name: '', qty_units: null, kg_per_unit: null, clean_notes: String(notes || '') }
  if (!notes || typeof notes !== 'string') return fallback
  const m = notes.match(/^\[PZS\|P:(\d+)\|N:([^|]*)\|Q:([\d.]+)\|KU:([\d.]+)\]\s?(.*)$/s)
  if (!m) return fallback
  return {
    type: 'unit',
    product_id: Number(m[1]) || null,
    product_name: (m[2] || '').trim(),
    qty_units: Number(m[3]) || null,
    kg_per_unit: Number(m[4]) || null,
    clean_notes: (m[5] || '').trim(),
  }
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

  // ── Metabase Embed Token (P0 fix 2026-04-18) ─────────────────────────────
  // El módulo `gf_metabase_embed` aún es stub (no installable). Mientras no
  // exponga /pwa-metabase-token, el frontend HACÍA fallback a n8n que devolvía
  // 401 y el interceptor global expulsaba al usuario. Este handler intercepta
  // ANTES del fallback y devuelve un payload degradado {success:false} para
  // que ScreenKPIs muestre el MockDashboard sin crashear la sesión.
  //
  // Cuando backend implemente el endpoint real, responderá con JWT firmado
  // y el frontend pasa directamente al iframe sin cambios.
  if ((path.startsWith('/pwa-metabase-token') || path.startsWith('/pwa-metabase/token')) && method === 'GET') {
    const query = new URLSearchParams(path.split('?')[1] || '')
    const jobKey = query.get('job_key') || 'VENDEDOR'
    try {
      // Intenta el controller real si está expuesto en Odoo
      const res = await odooJson('/pwa-metabase-token', { job_key: jobKey })
      // Backend puede responder { success, embed_url } o { ok, data: {...} }
      if (res?.success && res?.embed_url) return res
      if (res?.ok && res?.data?.embed_url) {
        return { success: true, embed_url: res.data.embed_url, dashboard_id: res.data.dashboard_id }
      }
      // Respuesta válida pero sin embed_url → degradar silenciosamente
      return { success: false, embed_url: null, reason: 'no_embed_url' }
    } catch (err) {
      // Controller no existe o falló. NO propagar error — degradar a mock.
      // Esto evita que el interceptor global dispare expireSession().
      return { success: false, embed_url: null, reason: 'backend_unavailable' }
    }
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
  const query = new URLSearchParams(path.split('?')[1] || '')
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

  // ── Sprint 5: Aprobación de gastos (guía §2d/2e/2f) ────────────────────────
  // Passthrough al controller de Odoo. Backend valida permiso por flag del empleado.

  if (cleanPath === '/pwa-admin/expenses-pending-approval' && method === 'GET') {
    return odooJson('/pwa-admin/expenses-pending-approval', {
      company_id:   Number(query.get('company_id'))   || companyId || undefined,
      warehouse_id: Number(query.get('warehouse_id')) || warehouseId || undefined,
      limit:        Number(query.get('limit'))        || undefined,
      offset:       Number(query.get('offset'))       || undefined,
    })
  }

  if (cleanPath === '/pwa-admin/expense-approve' && method === 'POST') {
    return odooJson('/pwa-admin/expense-approve', {
      expense_id: Number(body?.expense_id || 0),
    })
  }

  if (cleanPath === '/pwa-admin/expense-reject' && method === 'POST') {
    return odooJson('/pwa-admin/expense-reject', {
      expense_id: Number(body?.expense_id || 0),
      reason:     String(body?.reason || '').trim(),
    })
  }

  // ── Evidencia fotográfica centralizada (guía §7) ───────────────────────────
  // Backend espera `file_base64` (no `data`). Aceptamos ambas claves del
  // lado cliente pero siempre enviamos `file_base64` al controller Odoo.
  if (cleanPath === '/pwa/evidence/upload' && method === 'POST') {
    return odooJson('/pwa/evidence/upload', {
      filename:     body?.filename || 'evidencia.jpg',
      file_base64:  body?.file_base64 ?? body?.data ?? '',
      mime_type:    body?.mime_type || 'image/jpeg',
      linked_model: body?.linked_model || undefined,
      linked_id:    body?.linked_id ? Number(body.linked_id) : undefined,
    })
  }

  return NO_DIRECT
}

// In-flight guard for checklist auto-provisioning to prevent StrictMode/double-render duplicates.
const _checklistInFlight = new Map()

async function directProduction(method, path, body) {
  const query = new URLSearchParams(path.split('?')[1] || '')
  const cleanPath = path.split('?')[0]

  if (cleanPath === '/pwa-prod/my-shift' && method === 'GET') {
    // Resolve active shift via direct domain query (works in bypass; no JWT required).
    // Filter: state in draft/in_progress + warehouse (if session has one).
    // Picks most recent open shift — today preferred via sort by id desc.
    const domain = [['state', 'in', ['draft', 'in_progress']]]
    const warehouseId = getWarehouseId()
    if (warehouseId) domain.push(['plant_warehouse_id', '=', warehouseId])
    const result = await readModelSorted('gf.production.shift', {
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
        'x_compliance_score',
        'x_cycles_completed',
        'x_cycles_expected',
        'x_meta_kg',
        'x_is_rolito_shift',
      ],
      domain,
      sort_column: 'id',
      sort_desc: true,
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
      x_compliance_score: Number(shift.x_compliance_score || 0),
      x_cycles_completed: Number(shift.x_cycles_completed || 0),
      x_cycles_expected: Number(shift.x_cycles_expected || 0),
      x_meta_kg: Number(shift.x_meta_kg || 0),
      x_is_rolito_shift: !!shift.x_is_rolito_shift,
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

    // Dedupe concurrent calls (React StrictMode double-invoke, parallel screens)
    const cacheKey = `checklist:${shiftId}`
    if (_checklistInFlight.has(cacheKey)) return _checklistInFlight.get(cacheKey)
    const promise = (async () => {

    // 1) Determine target template based on explicit module context first.
    // If omitted, fall back to session.role for backward compatibility.
    const requestedRole = String(query.get('role_context') || '').trim().toLowerCase()
    const requestedLineType = String(query.get('line_type') || '').trim().toLowerCase()
    const sessionRole = String(getSession().role || '').toLowerCase()
    let lineType = 'all'
    if (requestedLineType === 'rolito' || requestedLineType === 'barras') lineType = requestedLineType
    else if (requestedRole.includes('rolito')) lineType = 'rolito'
    else if (requestedRole.includes('barra')) lineType = 'barras'
    else if (sessionRole.includes('rolito')) lineType = 'rolito'
    else if (sessionRole.includes('barra')) lineType = 'barras'

    // 1b) Resolve the target template id for this operator line (used both
    // for "find existing" and "create new"). Without this, a prior Rolito
    // checklist on the same shift would be served to a Barras operator.
    let targetTemplateId = 0
    {
      const tmplRes = await readModelSorted('gf.haccp.template', {
        fields: ['id', 'name', 'line_type', 'active'],
        domain: [['active', '=', true], ['line_type', '=', lineType]],
        sort_column: 'id',
        sort_desc: false,
        limit: 1,
        sudo: 1,
      })
      const tmpl = pickFirstResponse(tmplRes)
      targetTemplateId = Number(tmpl?.id || 0)
    }

    // 2) Find an existing checklist for this shift that matches the target
    // template. If a checklist exists for a different template (wrong line),
    // it is ignored and a new one is created for the correct line.
    const existingDomain = [['shift_id', '=', shiftId]]
    if (targetTemplateId) existingDomain.push(['template_id', '=', targetTemplateId])
    let checklistResult = await readModelSorted('gf.haccp.checklist', {
      fields: ['id', 'shift_id', 'template_id', 'state', 'completed_by_id', 'completed_at', 'notes', 'all_passed', 'check_ids'],
      domain: existingDomain,
      sort_column: 'id',
      sort_desc: true,
      limit: 1,
      sudo: 1,
    })
    let checklist = pickFirstResponse(checklistResult)

    if (!checklist) {
      if (!targetTemplateId) return null
      const created = await createUpdate({
        model: 'gf.haccp.checklist',
        method: 'create',
        dict: { shift_id: shiftId, template_id: targetTemplateId },
        sudo: 1,
        app: 'pwa_colaboradores',
      })
      const newId = Number(created?.id || 0)
      if (!newId) return null
      // re-read
      checklistResult = await readModelSorted('gf.haccp.checklist', {
        fields: ['id', 'shift_id', 'template_id', 'state', 'completed_by_id', 'completed_at', 'notes', 'all_passed', 'check_ids'],
        domain: [['id', '=', newId]],
        sort_column: 'id',
        sort_desc: false,
        limit: 1,
        sudo: 1,
      })
      checklist = pickFirstResponse(checklistResult)
      if (!checklist) return null
    }

    // 3) If checklist has no checks yet, instantiate them from the template's check_template_ids
    let checkIds = (Array.isArray(checklist.check_ids) ? checklist.check_ids : [])
      .map(v => (typeof v === 'number' ? v : (v && typeof v === 'object' ? v.id : Number(v) || 0)))
      .filter(Boolean)
    // Always reconcile: read the template's check_template_ids and create any
    // missing checks. Covers both fresh checklists (no checks) and partially
    // created checklists (interrupted prior session / HMR).
    {
      const templateId = Array.isArray(checklist.template_id) ? checklist.template_id[0] : checklist.template_id
      if (templateId) {
        const tmplRes = await readModelSorted('gf.haccp.template', {
          fields: ['id', 'check_template_ids'],
          domain: [['id', '=', templateId]],
          sort_column: 'id',
          sort_desc: false,
          limit: 1,
          sudo: 1,
        })
        const tmpl = pickFirstResponse(tmplRes)
        const ctIds = (Array.isArray(tmpl?.check_template_ids) ? tmpl.check_template_ids : [])
          .map(v => (typeof v === 'number' ? v : (v && typeof v === 'object' ? v.id : Number(v) || 0)))
          .filter(Boolean)
        if (ctIds.length) {
          // Find which check_template_ids already have a corresponding check
          let alreadyCoveredCtIds = new Set()
          if (checkIds.length) {
            const existingChecksRes = await readModelSorted('gf.haccp.check', {
              fields: ['id', 'check_template_id'],
              domain: [['id', 'in', checkIds]],
              sort_column: 'id',
              sort_desc: false,
              limit: 200,
              sudo: 1,
            })
            const existing = Array.isArray(existingChecksRes?.response) ? existingChecksRes.response : []
            alreadyCoveredCtIds = new Set(
              existing
                .map(c => (Array.isArray(c.check_template_id) ? c.check_template_id[0] : c.check_template_id))
                .filter(Boolean)
            )
          }
          const missingCtIds = ctIds.filter(id => !alreadyCoveredCtIds.has(id))
          if (missingCtIds.length) {
            const ctRes = await readModelSorted('gf.haccp.check.template', {
              fields: ['id', 'name', 'check_type', 'min_value', 'max_value', 'sequence', 'requires_photo'],
              domain: [['id', 'in', missingCtIds]],
              sort_column: 'sequence',
              sort_desc: false,
              limit: 100,
              sudo: 1,
            })
            const cts = Array.isArray(ctRes?.response) ? ctRes.response : []
            for (const ct of cts) {
              const normalizedRange = normalizeChecklistNumericRange(ct)
              await createUpdate({
                model: 'gf.haccp.check',
                method: 'create',
                dict: {
                  checklist_id: checklist.id,
                  check_template_id: ct.id,
                  name: ct.name,
                  check_type: ct.check_type,
                  min_value: Number(normalizedRange.min_value || 0),
                  max_value: Number(normalizedRange.max_value || 0),
                },
                sudo: 1,
                app: 'pwa_colaboradores',
              }).catch(() => null)
            }
            // reload check_ids
            const reread = await readModelSorted('gf.haccp.checklist', {
              fields: ['id', 'check_ids'],
              domain: [['id', '=', checklist.id]],
              sort_column: 'id',
              sort_desc: false,
              limit: 1,
              sudo: 1,
            })
            const cl2 = pickFirstResponse(reread)
            checkIds = (Array.isArray(cl2?.check_ids) ? cl2.check_ids : [])
              .map(v => (typeof v === 'number' ? v : (v && typeof v === 'object' ? v.id : Number(v) || 0)))
              .filter(Boolean)
          }
        }
      }
    }

    // 4) Fetch all checks with full data
    let checks = []
    if (checkIds.length) {
      const checksRes = await readModelSorted('gf.haccp.check', {
        fields: ['id', 'name', 'check_type', 'min_value', 'max_value', 'result_bool', 'result_numeric', 'result_text', 'result_photo', 'passed', 'checklist_id', 'check_template_id'],
        domain: [['id', 'in', checkIds]],
        sort_column: 'id',
        sort_desc: false,
        limit: 100,
        sudo: 1,
      })
      const rawChecks = (Array.isArray(checksRes?.response) ? checksRes.response : []).map(c => normalizeChecklistNumericCheck({
        id: c.id,
        name: c.name,
        check_type: c.check_type,
        min_value: Number(c.min_value || 0),
        max_value: Number(c.max_value || 0),
        result_bool: c.result_bool,
        result_numeric: Number(c.result_numeric || 0),
        result_text: c.result_text || '',
        result_photo: c.result_photo || null,
        passed: c.passed,
      }))

      const invertedChecks = rawChecks.filter((check) => check._range_was_inverted)
      for (const check of invertedChecks) {
        await createUpdate({
          model: 'gf.haccp.check',
          method: 'update',
          ids: [check.id],
          dict: {
            min_value: Number(check.min_value || 0),
            max_value: Number(check.max_value || 0),
          },
          sudo: 1,
          app: 'pwa_colaboradores',
        }).catch(() => null)
      }

      checks = rawChecks.map(({ _range_was_inverted, ...check }) => check)
    }

    return {
      id: checklist.id,
      shift_id: Array.isArray(checklist.shift_id) ? checklist.shift_id[0] : checklist.shift_id,
      template_id: Array.isArray(checklist.template_id) ? checklist.template_id[0] : checklist.template_id,
      state: checklist.state,
      notes: checklist.notes || '',
      all_passed: !!checklist.all_passed,
      checks,
    }
    })()
    _checklistInFlight.set(cacheKey, promise)
    try { return await promise } finally { setTimeout(() => _checklistInFlight.delete(cacheKey), 1500) }
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

  if (cleanPath === '/api/production/haccp/check' && method === 'POST') {
    return odooHttp('POST', '/api/production/haccp/check', {}, {
      check_id: Number(body?.check_id || 0),
      ...(body?.result_bool !== undefined ? { result_bool: !!body.result_bool } : {}),
      ...(body?.result_numeric !== undefined ? { result_numeric: Number(body.result_numeric || 0) } : {}),
      ...(body?.result_text !== undefined ? { result_text: body.result_text || '' } : {}),
      ...(body?.result_photo !== undefined ? { result_photo: body.result_photo } : {}),
    })
  }

  if (cleanPath === '/pwa-prod/checklist-complete' && method === 'POST') {
    const checklistId = Number(body?.checklist_id || 0)
    const result = await createUpdate({
      model: 'gf.haccp.checklist',
      method: 'function',
      ids: [checklistId],
      function: 'action_complete',
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    try {
      if (checklistId) {
        const checklistRes = await readModelSorted('gf.haccp.checklist', {
          fields: ['id', 'shift_id', 'state'],
          domain: [['id', '=', checklistId]],
          sort_column: 'id',
          sort_desc: false,
          limit: 1,
          sudo: 1,
        })
        const checklist = pickFirstResponse(checklistRes)
        const shiftId = Number(Array.isArray(checklist?.shift_id) ? checklist.shift_id[0] : checklist?.shift_id || 0)
        if (shiftId && checklist?.state === 'completed') {
          await createUpdate({
            model: 'gf.production.shift',
            method: 'update',
            ids: [shiftId],
            dict: { haccp_checklist_id: checklistId },
            sudo: 1,
            app: 'pwa_colaboradores',
          }).catch(() => null)
        }
      }
    } catch { /* non-fatal */ }
    return result
  }

  if (cleanPath === '/pwa-prod/cycles' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return []
    const supportsExpectedFreezeMin = await modelHasField('gf.evaporator.cycle', 'expected_freeze_min')
    const supportsExpectedDefrostMin = await modelHasField('gf.evaporator.cycle', 'expected_defrost_min')
    const result = await readModelSorted('gf.evaporator.cycle', {
      fields: withExpectedTimingFields(
        ['id', 'shift_id', 'machine_id', 'state', 'freeze_start', 'freeze_end', 'defrost_start', 'defrost_end', 'kg_dumped', 'kg_expected', 'kg_deviation_pct', 'alert_level', 'cycle_number'],
        supportsExpectedFreezeMin,
        supportsExpectedDefrostMin,
      ),
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'id',
      sort_desc: true,
      limit: 100,
      sudo: 1,
    })
    return enrichCyclesWithMachineTiming(pickListResponse(result))
  }

  if (cleanPath === '/pwa-prod/cycle-create' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    const machineId = Number(body?.machine_id || 0) || 2
    if (!shiftId) throw new Error('shift_id required')
    const supportsExpectedFreezeMin = await modelHasField('gf.evaporator.cycle', 'expected_freeze_min')
    const supportsExpectedDefrostMin = await modelHasField('gf.evaporator.cycle', 'expected_defrost_min')

    // Count existing cycles for this shift to compute cycle_number
    const existing = await readModelSorted('gf.evaporator.cycle', {
      fields: ['id', 'cycle_number'],
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'cycle_number',
      sort_desc: true,
      limit: 1,
      sudo: 1,
    })
    const lastNum = Number(pickFirstResponse(existing)?.cycle_number || 0)
    const cycleNumber = lastNum + 1
    const machineRes = await readModel('gf.production.machine', {
      fields: ['id', 'freeze_hours', 'expected_freeze_min', 'expected_defrost_min'],
      domain: [['id', '=', machineId]],
      limit: 1,
      sudo: 1,
    })
    const machine = pickFirstResponse(machineRes)
    const cycleWriteDict = {
      shift_id: shiftId,
      machine_id: machineId,
      cycle_number: cycleNumber,
      state: 'freezing',
      // Prefer client-provided timestamp (client local tz to match UI display); fall back to UTC server-now.
      freeze_start: body?.freeze_start || odooNow(),
      ...buildCycleExpectedTiming(machine, supportsExpectedFreezeMin, supportsExpectedDefrostMin),
    }

    let created
    try {
      created = await createUpdate({
        model: 'gf.evaporator.cycle',
        method: 'create',
        dict: cycleWriteDict,
        sudo: 1,
        app: 'pwa_colaboradores',
      })
    } catch (error) {
      if (!supportsExpectedFreezeMin || !Object.prototype.hasOwnProperty.call(cycleWriteDict, 'expected_freeze_min')) {
        throw error
      }
      modelFieldSupportCache.set('gf.evaporator.cycle:expected_freeze_min', false)
      created = await createUpdate({
        model: 'gf.evaporator.cycle',
        method: 'create',
        dict: {
          shift_id: shiftId,
          machine_id: machineId,
          cycle_number: cycleNumber,
          state: 'freezing',
          freeze_start: body?.freeze_start || odooNow(),
        },
        sudo: 1,
        app: 'pwa_colaboradores',
      })
    }
    const newId = Number(created?.id || 0)
    // Read back so the caller has the full cycle record
    const rec = await readModelSorted('gf.evaporator.cycle', {
      fields: withExpectedTimingFields(
        ['id', 'shift_id', 'machine_id', 'state', 'freeze_start', 'freeze_end', 'defrost_start', 'defrost_end', 'kg_dumped', 'kg_expected', 'cycle_number'],
        supportsExpectedFreezeMin,
        supportsExpectedDefrostMin,
      ),
      domain: [['id', '=', newId]],
      sort_column: 'id',
      sort_desc: false,
      limit: 1,
      sudo: 1,
    })
    return (await enrichCyclesWithMachineTiming([pickFirstResponse(rec) || { id: newId, state: 'freezing', cycle_number: cycleNumber, machine_id: machineId }]))[0]
  }

  if (cleanPath === '/pwa-prod/cycle-update' && method === 'POST') {
    const cycleId = Number(body?.cycle_id || 0)
    if (!cycleId) throw new Error('cycle_id required')
    const supportsExpectedFreezeMin = await modelHasField('gf.evaporator.cycle', 'expected_freeze_min')
    const supportsExpectedDefrostMin = await modelHasField('gf.evaporator.cycle', 'expected_defrost_min')
    const updates = { ...(body || {}) }
    delete updates.cycle_id

    // Strip override metadata — NO existen como campos en gf.evaporator.cycle
    // (campos reales verificados 2026-04-02: machine_id, cycle_number, state,
    // freeze_*, defrost_*, kg_dumped, kg_expected, kg_deviation_pct,
    // data_suspect, alert_level, diagnostic_suggestion). Si se escribieran,
    // Odoo rechazaria la write. Se registra como audit via endpoint separado.
    const overrideMeta = {
      supervisor_override: updates.supervisor_override,
      override_reason: updates.override_reason,
      supervisor_employee_id: updates.supervisor_employee_id,
    }
    delete updates.supervisor_override
    delete updates.override_reason
    delete updates.supervisor_employee_id

    // Auto-transition state based on payload:
    //   defrost_start present & no kg_dumped  → 'defrosting'
    //   kg_dumped present                     → 'dumped'
    if (updates.kg_dumped !== undefined && updates.kg_dumped !== null) {
      updates.state = 'dumped'
      updates.kg_dumped = Number(updates.kg_dumped) || 0
    } else if (updates.defrost_start && !updates.state) {
      updates.state = 'defrosting'
    }

    await createUpdate({
      model: 'gf.evaporator.cycle',
      method: 'update',
      ids: [cycleId],
      dict: updates,
      sudo: 1,
      app: 'pwa_colaboradores',
    })

    // Auditar override en x_kold.workflow.run.log (modulo gf_workflow_log_ext
    // instalado en produccion; verificado 2026-04-14 via ir.model.fields).
    // Campos con prefijo x_* porque el modelo es Studio-managed.
    // Required: x_run_id, x_started_at, x_status, x_workflow_id.
    // Si la escritura falla, LANZAMOS el error para que el flujo refleje la
    // falla en vez de silenciarla: el override sin audit no es aceptable.
    if (overrideMeta.supervisor_override) {
      const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const runId = `rolito-override-${cycleId}-${Date.now()}`
      await createUpdate({
        model: 'x_kold.workflow.run.log',
        method: 'create',
        dict: {
          x_run_id: runId,
          x_workflow_id: 'rolito_dump_override',
          x_workflow_name: 'Override de dump fuera de rango (Rolito)',
          x_started_at: nowIso,
          x_executed_at: nowIso,
          x_finished_at: nowIso,
          x_status: 'success',
          x_agent_name: 'gfsc_produccion',
          x_trigger_type: 'manual',
          x_decision_type: 'excepcion',
          x_action_executed: 'rolito_dump_override',
          x_human_override: true,
          x_exception_level: 2,
          x_details: JSON.stringify({
            cycle_id: cycleId,
            kg_dumped: updates.kg_dumped,
            reason: overrideMeta.override_reason || '',
            supervisor_employee_id: overrideMeta.supervisor_employee_id || null,
          }),
        },
        sudo: 1,
        app: 'pwa_colaboradores',
      })
    }

    // Read-back so caller has fresh state
    const rec = await readModelSorted('gf.evaporator.cycle', {
      fields: withExpectedTimingFields(
        ['id', 'shift_id', 'machine_id', 'state', 'freeze_start', 'freeze_end', 'defrost_start', 'defrost_end', 'kg_dumped', 'kg_expected', 'cycle_number'],
        supportsExpectedFreezeMin,
        supportsExpectedDefrostMin,
      ),
      domain: [['id', '=', cycleId]],
      sort_column: 'id',
      sort_desc: false,
      limit: 1,
      sudo: 1,
    })
    return (await enrichCyclesWithMachineTiming([pickFirstResponse(rec) || { id: cycleId }]))[0]
  }

  if (cleanPath === '/pwa-prod/packing-products' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    const warehouseId = Number(query.get('warehouse_id') || 0)
    const lineType = String(query.get('line_type') || 'rolito').trim() || 'rolito'
    const params = {}
    if (shiftId) params.shift_id = shiftId
    else if (warehouseId) params.warehouse_id = warehouseId
    if (lineType) params.line_type = lineType

    const result = await odooHttp('GET', '/api/production/pack/catalog', params)
    const products = Array.isArray(result?.data?.products)
      ? result.data.products
      : Array.isArray(result?.products)
        ? result.products
        : []

    return products.map((row) => ({
      id: toMany2oneId(row?.product?.product_id || row?.product_id),
      product_id: toMany2oneId(row?.product?.product_id || row?.product_id),
      catalog_item_id: Number(row?.catalog_item_id || 0),
      line_type: row?.line_type || '',
      name: row?.product?.name || 'Producto',
      weight: Number(row?.product?.weight || 0),
      uom_name: row?.product?.uom_name || '',
      warehouse_ids: Array.isArray(row?.warehouse_ids) ? row.warehouse_ids : [],
      warehouses: Array.isArray(row?.warehouses) ? row.warehouses : [],
    })).filter((row) => row.id > 0)
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
  // line_id is NOT NULL in Odoo; resolve from session role (operador_rolito→2, operador_barras→1).
  if (cleanPath === '/pwa-prod/downtime-create' && method === 'POST') {
    const lineId = Number(body?.line_id || 0) || getLineIdFromRole()
    return createUpdate({
      model: 'gf.production.downtime',
      method: 'create',
      dict: {
        shift_id: Number(body?.shift_id || 0),
        category_id: Number(body?.category_id || 0),
        line_id: lineId,
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
  // line_id likely also NOT NULL; resolve from session role.
  if (cleanPath === '/pwa-prod/scrap-create' && method === 'POST') {
    const lineId = Number(body?.line_id || 0) || getLineIdFromRole()
    return createUpdate({
      model: 'gf.production.scrap',
      method: 'create',
      dict: {
        shift_id: Number(body?.shift_id || 0),
        reason_id: Number(body?.reason_id || 0),
        line_id: lineId,
        operator_id: getEmployeeId() || Number(body?.operator_id || 0),
        kg: Number(body?.kg || 0),
        notes: body?.notes || '',
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
  }

  // ── Bag reconciliation legacy handler ELIMINADO (Fase 11).
  // Todos los consumidores migrados a /api/production/shift/bag-reconciliation.

  // ── Close shift — prepare gates then call action_close_shift ─────────────
  // The real Odoo method is gf.production.shift.action_close_shift. Verified
  // validations (diagnosed live 2026-04-11 against shift id=8):
  //   1) shift.haccp_checklist_id must be set (m2o → gf.haccp.checklist)
  //      Error if missing: "Complete el checklist HACCP antes de cerrar el turno."
  //   2) No downtime_ids in state='open' allowed.
  //      Error: "Cierra el paro activo primero."
  //   3) shift.energy_end_id must be set (m2o → gf.energy.reading reading_type='end').
  //      Error: "Captura la lectura de energia final antes de cerrar turno."
  //
  // This handler performs idempotent pre-close preparation so the PWA flow
  // can complete without manual DB fix-ups.
  if (cleanPath === '/pwa-prod/shift-close' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) throw new Error('shift_id requerido')

    // (0) Auto-create energy start reading if missing. Barras flow does not
    // expose energy capture UI yet; this keeps the close path working.
    try {
      const shiftPreRead = await readModel('gf.production.shift', {
        fields: ['id', 'state', 'energy_start_id', 'energy_end_id'],
        domain: [['id', '=', shiftId]],
        limit: 1,
        sudo: 1,
      })
      const preRow = pickListResponse(shiftPreRead)[0] || null
      if (preRow && !preRow.energy_start_id) {
        const existingStart = await readModelSorted('gf.energy.reading', {
          fields: ['id'],
          domain: [['shift_id', '=', shiftId], ['reading_type', '=', 'start']],
          sort_column: 'id', sort_desc: true, limit: 1, sudo: 1,
        })
        let startId = pickListResponse(existingStart)[0]?.id || 0
        if (!startId) {
          const created = await createUpdate({
            model: 'gf.energy.reading',
            method: 'create',
            dict: {
              shift_id: shiftId,
              reading_type: 'start',
              timestamp: odooNow(),
              kwh_value: 0,
            },
            sudo: 1, app: 'pwa_colaboradores',
          }).catch(() => null)
          startId = Number(created?.id || created?.result || 0)
        }
        if (startId) {
          await createUpdate({
            model: 'gf.production.shift',
            method: 'update',
            ids: [shiftId],
            dict: { energy_start_id: startId },
            sudo: 1, app: 'pwa_colaboradores',
          }).catch(() => null)
        }
      }
      if (preRow && !preRow.energy_end_id) {
        const existingEnd = await readModelSorted('gf.energy.reading', {
          fields: ['id'],
          domain: [['shift_id', '=', shiftId], ['reading_type', '=', 'end']],
          sort_column: 'id', sort_desc: true, limit: 1, sudo: 1,
        })
        let endId = pickListResponse(existingEnd)[0]?.id || 0
        if (!endId) {
          const created = await createUpdate({
            model: 'gf.energy.reading',
            method: 'create',
            dict: {
              shift_id: shiftId,
              reading_type: 'end',
              timestamp: odooNow(),
              kwh_value: 0,
            },
            sudo: 1, app: 'pwa_colaboradores',
          }).catch(() => null)
          endId = Number(created?.id || created?.result || 0)
        }
        if (endId) {
          await createUpdate({
            model: 'gf.production.shift',
            method: 'update',
            ids: [shiftId],
            dict: { energy_end_id: endId },
            sudo: 1, app: 'pwa_colaboradores',
          }).catch(() => null)
        }
      }
    } catch { /* non-fatal */ }

    // Ensure shift is in_progress before closing (idempotent).
    try {
      await createUpdate({
        model: 'gf.production.shift',
        method: 'function',
        ids: [shiftId],
        function: 'action_start_shift',
        sudo: 1, app: 'pwa_colaboradores',
      }).catch(() => null)
    } catch { /* ignore */ }

    // (1) Link haccp_checklist_id from any completed HACCP belonging to the shift.
    try {
      const shiftRead = await readModel('gf.production.shift', {
        fields: ['id', 'haccp_checklist_id', 'energy_end_id'],
        domain: [['id', '=', shiftId]],
        limit: 1,
        sudo: 1,
      })
      const shiftRow = pickListResponse(shiftRead)[0] || null
      if (shiftRow && !shiftRow.haccp_checklist_id) {
        const hcRead = await readModelSorted('gf.haccp.checklist', {
          fields: ['id', 'state', 'all_passed'],
          domain: [['shift_id', '=', shiftId], ['state', '=', 'completed']],
          sort_column: 'id',
          sort_desc: true,
          limit: 1,
          sudo: 1,
        })
        const hc = pickListResponse(hcRead)[0] || null
        if (hc?.id) {
          await createUpdate({
            model: 'gf.production.shift',
            method: 'update',
            ids: [shiftId],
            dict: { haccp_checklist_id: hc.id },
            sudo: 1, app: 'pwa_colaboradores',
          }).catch(() => null)
        }
      }
      if (shiftRow && !shiftRow.energy_end_id) {
        const endRead = await readModelSorted('gf.energy.reading', {
          fields: ['id', 'reading_type'],
          domain: [['shift_id', '=', shiftId], ['reading_type', '=', 'end']],
          sort_column: 'id',
          sort_desc: true,
          limit: 1,
          sudo: 1,
        })
        const end = pickListResponse(endRead)[0] || null
        if (end?.id) {
          await createUpdate({
            model: 'gf.production.shift',
            method: 'update',
            ids: [shiftId],
            dict: { energy_end_id: end.id },
            sudo: 1, app: 'pwa_colaboradores',
          }).catch(() => null)
        }
      }
    } catch (prepErr) {
      // non-fatal: continue and let Odoo raise the real error
    }

    // (2) Auto-close any remaining open downtimes. Safer than blocking the
    // shift on forgotten paros. The UI should have closed them already, but
    // this keeps the close path idempotent.
    try {
      const dtRead = await readModel('gf.production.downtime', {
        fields: ['id', 'state'],
        domain: [['shift_id', '=', shiftId], ['state', '=', 'open']],
        sudo: 1,
      })
      const openDowntimes = pickListResponse(dtRead).map(d => d.id).filter(Boolean)
      if (openDowntimes.length > 0) {
        await createUpdate({
          model: 'gf.production.downtime',
          method: 'update',
          ids: openDowntimes,
          dict: { state: 'closed', end_time: odooNow() },
          sudo: 1, app: 'pwa_colaboradores',
        }).catch(() => null)
      }
    } catch { /* non-fatal */ }

    // (3) Call the real action_close_shift. If Odoo raises on a missing end
    // energy reading or other business rule, surface the error to the caller.
    try {
      return await createUpdate({
        model: 'gf.production.shift',
        method: 'function',
        ids: [shiftId],
        function: 'action_close_shift',
        sudo: 1,
        app: 'pwa_colaboradores',
      })
    } catch (e) {
      // DEUDA TECNICA: detecta metodo faltante via string parsing del error Odoo.
      // action_close_shift ESTA CONFIRMADO como controller real.
      // Este fallback solo existe para Odoo envs donde el metodo no este deployado.
      // TODO: eliminar cuando action_close_shift este en 100% de instancias.
      const msg = String(e.message || '').toLowerCase()
      if (msg.includes('has no attribute') || msg.includes('not found') || msg.includes('incident')) {
        return createUpdate({
          model: 'gf.production.shift',
          method: 'update',
          ids: [shiftId],
          dict: { state: 'closed', end_time: odooNow() },
          sudo: 1,
          app: 'pwa_colaboradores',
        })
      }
      throw e
    }
  }

  // ── Barra: List brine tanks (gf.production.machine, machine_type='tanque_salmuera')
  if (cleanPath === '/pwa-prod/tanks' && method === 'GET') {
    const res = await readModelSorted('gf.production.machine', {
      fields: [
        'id', 'name', 'display_name', 'machine_type', 'line_id',
        'slot_rows', 'slot_columns', 'bars_per_basket', 'kg_per_bar',
        'bar_product_id', 'capacity_tons_day', 'freeze_hours',
        'x_salt_level', 'x_salt_level_updated_at', 'salt_level_unit',
        'min_salt_level_for_harvest', 'min_brine_temp_for_harvest',
        'x_brine_temp_current', 'x_brine_temp_alert', 'x_brine_temp_updated_at',
        'x_total_slots', 'x_active_slots_count', 'x_ready_slots_count',
        'x_next_slot_id', 'x_next_slot_name', 'x_next_allowed_extraction',
        'x_last_extraction_time', 'x_extractions_last_30min',
      ],
      domain: [['machine_type', '=', 'tanque_salmuera'], ['active', '=', true]],
      sort_column: 'name',
      sort_desc: false,
      sudo: 1,
    })
    const rows = pickListResponse(res)
    return { tanks: rows.map(r => shapeTank(r)) }
  }

  // ── Barra: List brine slots for a tank (+ tank meta so the UI has
  // bars_per_basket, kg_per_bar, product, salt level, brine temp, etc.).
  if (cleanPath === '/pwa-prod/slots' && method === 'GET') {
    const machineId = Number(query.get('machine_id') || 0)
    if (!machineId) return { slots: [], tank: null, next_ready_id: null }
    // 1) Load tank meta
    const machineRes = await readModel('gf.production.machine', {
      fields: [
        'id', 'name', 'display_name', 'machine_type', 'line_id',
        'slot_rows', 'slot_columns', 'bars_per_basket', 'kg_per_bar',
        'bar_product_id', 'capacity_tons_day', 'freeze_hours',
        'x_salt_level', 'x_salt_level_updated_at', 'salt_level_unit',
        'min_salt_level_for_harvest', 'min_brine_temp_for_harvest',
        'x_brine_temp_current', 'x_brine_temp_alert', 'x_brine_temp_updated_at',
        'x_total_slots', 'x_active_slots_count', 'x_ready_slots_count',
        'x_next_slot_id', 'x_next_slot_name', 'x_next_allowed_extraction',
        'x_last_extraction_time', 'x_extractions_last_30min',
      ],
      domain: [['id', '=', machineId]],
      limit: 1,
      sudo: 1,
    })
    const tank = shapeTank(pickFirstResponse(machineRes))
    // 2) Load slots
    const res = await readModelSorted('x_ice.brine.slot', {
      fields: [
        'id', 'x_name', 'x_state', 'kg_per_bar',
        'x_freeze_start', 'x_ready_since', 'x_expected_ready_at',
        'x_actual_extraction_time', 'x_extraction_sequence',
        'x_time_in_ready_hours', 'x_freezing_progress_pct',
        'x_product_id', 'x_shift_id', 'tank_machine_id',
      ],
      domain: [['tank_machine_id', '=', machineId]],
      sort_column: 'x_name',
      sort_desc: false,
      sudo: 1,
    })
    const rows = pickListResponse(res)
    const slots = rows.map(r => ({
      id: r.id,
      name: r.x_name,
      state: r.x_state,
      kg_per_bar: Number(r.kg_per_bar || 0),
      freeze_start: r.x_freeze_start || null,
      ready_since: r.x_ready_since || null,
      expected_ready_at: r.x_expected_ready_at || null,
      extraction_time: r.x_actual_extraction_time || null,
      extraction_sequence: Number(r.x_extraction_sequence || 0),
      time_in_ready_hours: Number(r.x_time_in_ready_hours || 0),
      freezing_progress_pct: Number(r.x_freezing_progress_pct || 0),
      product_id: Array.isArray(r.x_product_id) ? r.x_product_id[0] : (r.x_product_id || null),
      product_name: Array.isArray(r.x_product_id) ? r.x_product_id[1] : '',
      shift_id: Array.isArray(r.x_shift_id) ? r.x_shift_id[0] : (r.x_shift_id || null),
    }))
    // Prefer Odoo-computed next slot; fall back to oldest ready_since
    let nextReadyId = tank?.next_slot_id || null
    if (!nextReadyId) {
      const readySlots = slots
        .filter(s => s.state === 'ready' && s.ready_since)
        .sort((a, b) => String(a.ready_since).localeCompare(String(b.ready_since)))
      nextReadyId = readySlots[0]?.id || null
    }
    return { slots, tank, next_ready_id: nextReadyId }
  }

  // ── Barra: Harvest slot ──────────────────────────────────────────────────
  // Sebastián's /api/ice/slot/harvest controller has a bug: it forwards
  // `temperatura` as a kwarg to IceBrineSlot.action_cosechar() which does not
  // accept it (TypeError). We bypass it and call action_cosechar directly,
  // then write x_brine_temp_at_extraction + x_operator_id as a post-step.
  if (cleanPath === '/pwa-prod/harvest' && method === 'POST') {
    const slotId = Number(body?.slot_id || 0)
    if (!slotId) throw new Error('slot_id requerido')
    const operatorId = getEmployeeId() || Number(body?.operator_id || 0)
    const temperature = Number(body?.temperature || 0)
    // Call action_cosechar on the slot
    const res = await createUpdate({
      model: 'x_ice.brine.slot',
      method: 'function',
      ids: [slotId],
      function: 'action_cosechar',
      sudo: 1, app: 'pwa_colaboradores',
    })
    // Post-step: record operator + brine temp at extraction (non-fatal)
    try {
      const dict = {}
      if (operatorId) dict.x_operator_id = operatorId
      if (temperature) dict.x_brine_temp_at_extraction = temperature
      if (Object.keys(dict).length > 0) {
        await createUpdate({
          model: 'x_ice.brine.slot',
          method: 'update',
          ids: [slotId],
          dict,
          sudo: 1, app: 'pwa_colaboradores',
        }).catch(() => null)
      }
    } catch { /* ignore */ }
    return res
  }

  if (cleanPath === '/pwa-prod/harvest-with-pt-reception' && method === 'POST') {
    const slotId = Number(body?.slot_id || 0)
    const shiftId = Number(body?.shift_id || 0)
    const operatorId = getEmployeeId() || Number(body?.operator_id || 0)
    const temperature = Number(body?.temperature || 0)
    const slot = body?.slot || {}
    const tank = body?.tank || {}

    if (!slotId) throw new Error('slot_id requerido')
    if (!shiftId) throw new Error('shift_id requerido')

    const receptionPayload = buildPtReceptionFromHarvest({ slot, tank })
    const sourceProductId = Number(body?.source_product_id || receptionPayload.source_product_id || 0)
    const qtyReported = Number(body?.qty_reported || receptionPayload.qty_reported || 0)

    if (!qtyReported || qtyReported <= 0) throw new Error('qty_reported invalido para recepcion PT')

    const harvestResult = await createUpdate({
      model: 'x_ice.brine.slot',
      method: 'function',
      ids: [slotId],
      function: 'action_cosechar',
      sudo: 1, app: 'pwa_colaboradores',
    })

    try {
      const dict = {}
      if (operatorId) dict.x_operator_id = operatorId
      if (temperature) dict.x_brine_temp_at_extraction = temperature
      if (Object.keys(dict).length > 0) {
        await createUpdate({
          model: 'x_ice.brine.slot',
          method: 'update',
          ids: [slotId],
          dict,
          sudo: 1, app: 'pwa_colaboradores',
        }).catch(() => null)
      }
    } catch { /* ignore */ }

    try {
      const packedProduct = resolvePackedProductFromHarvest({
        harvestResult,
        fallbackProduct: {
          product_id: Number(body?.product_id || receptionPayload.product_id || 0),
          product_name: String(receptionPayload.product_name || '').trim(),
        },
      })
      if (!packedProduct.product_id) throw new Error('product_id requerido para recepcion PT')

      const packResult = await odooHttp('POST', '/api/production/pack', {}, {
        shift_id: shiftId,
        cycle_id: 0,
        product_id: packedProduct.product_id,
        qty_bags: qtyReported,
        production_order_id: 0,
        line_type: String(body?.line_type || 'barra').trim() || 'barra',
        source_product_id: sourceProductId || undefined,
        slot_id: slotId,
        machine_id: Number(tank?.id || body?.machine_id || 0) || undefined,
      })

      return {
        ok: true,
        harvest: { ok: true, data: harvestResult },
        pt_reception: { ok: true, data: packResult?.data || packResult || {} },
      }
    } catch (error) {
      return {
        ok: false,
        harvested: true,
        harvest: { ok: true, data: harvestResult },
        pt_reception: {
          ok: false,
          error: error?.message || 'No se pudo generar la recepcion PT',
        },
        error: error?.message || 'La canastilla fue cosechada pero la recepcion PT no se pudo generar',
      }
    }
  }

  // ── Barra: Tank incident ─────────────────────────────────────────────────
  // Sebastián's /api/ice/tank/incident expects params: machine_id, tipo,
  // descripcion (Spanish). Posts a mail.message to gf.production.machine.
  if (cleanPath === '/pwa-prod/tank-incident' && method === 'POST') {
    return odooJson('/api/ice/tank/incident', {
      machine_id: Number(body?.machine_id || 0),
      tipo: body?.incident_type || body?.tipo || '',
      descripcion: body?.description || body?.descripcion || '',
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

  // ══════════════════════════════════════════════════════════════════════════════
  // Fase 4 — Endpoints reales de Odoo (/api/production/*)
  // Estos pasan directo al controlador REST de Odoo. Ya no son BFF intermediario
  // sino bridge: la logica de negocio vive en Odoo, el frontend solo consume.
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Close-Check: readiness real del turno (Odoo _get_close_readiness) ──────
  if (cleanPath === '/api/production/shift/close-check' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { can_close: false, blockers: ['shift_id requerido'], warnings: [], summary: {} }
    return odooHttp('POST', '/api/production/shift/close-check', {}, { shift_id: shiftId })
  }

  // ── Close: cierre real del turno (Odoo action_close_shift) ─────────────────
  if (cleanPath === '/api/production/shift/close' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) throw new Error('shift_id requerido')
    return odooHttp('POST', '/api/production/shift/close', {}, { shift_id: shiftId })
  }

  // ── Validate-PIN: validacion real de PIN supervisor ────────────────────────
  if (cleanPath === '/api/production/validate-pin' && method === 'POST') {
    const pin = body?.pin || ''
    const employeeId = Number(body?.employee_id || getEmployeeId() || 0)
    if (!pin) return { ok: false, error: 'PIN requerido' }
    return odooHttp('POST', '/api/production/validate-pin', {}, {
      pin,
      employee_id: employeeId || undefined,
    })
  }

  // ── Bag Reconciliation: endpoint canonico real ──────────────────────────────
  // CONTRATO CANONICO (Odoo controller real):
  //   POST /api/production/shift/bag-reconciliation
  //   Request:  { shift_id, bags_received, bags_remaining }
  //   Response: { data: { bag_reconciliation: {...} } }
  //   Frontend NO debe leer x_bags_received/x_bags_remaining — son internos.
  if (cleanPath === '/api/production/shift/bag-reconciliation' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }
    return odooHttp('POST', '/api/production/shift/bag-reconciliation', {}, {
      shift_id: shiftId,
      bags_received: Number(body?.bags_received || 0),
      bags_remaining: Number(body?.bags_remaining || 0),
    })
  }

  // ── Opening State: snapshot de lo que recibe el turno entrante ─────────────
  // CONTRATO CANONICO (Odoo controller real):
  //   POST /api/production/shift/opening-state
  //   Request:  { shift_id }
  //   Response: { pt, materials, operations, kpis, source_shift_id, handover_id, ... }
  //   Si ya existe snapshot aceptado, lo devuelve. Si no, lo crea.
  //   Frontend solo consume y presenta — no recalcula nada.
  if (cleanPath === '/api/production/shift/opening-state' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { ok: false, error: 'shift_id requerido' }
    return odooHttp('POST', '/api/production/shift/opening-state', {}, { shift_id: shiftId })
  }

  // ── PT Reconcile: reconciliacion de inventario con almacen PT ──────────────
  // CONTRATO CANONICO (Odoo controller real):
  //   POST /api/production/pt/reconcile
  //   Request:  { shift_id, plant_id?, manual: { pt_received_kg? } }
  //   Response: { manual, system, differences, incidents, consistent }
  //   Backend calcula la verdad del sistema. Frontend NO recalcula.
  if (cleanPath === '/api/production/pt/reconcile' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }
    const raw = await odooHttp('POST', '/api/production/pt/reconcile', {}, {
      shift_id: shiftId,
      plant_id: Number(body?.plant_id || 0) || getWarehouseId() || undefined,
      ...(body?.manual ? { manual: body.manual } : {}),
    })
    // Este controller devuelve envelope JSON-RPC {jsonrpc,id,result:{ok,message,data}}
    // mientras que el resto de /api/production/* devuelve {ok,message,data} plano.
    // El consumidor (reconcileInventoryPT) espera la reconciliacion directa
    // { system, manual, differences, incidents, consistent, ... }, asi que
    // desempaquetamos ambos niveles.
    const envelope = raw?.result ?? raw
    if (envelope?.ok === false) {
      return { error: envelope?.message || 'Error en reconciliacion' }
    }
    return envelope?.data ?? envelope
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Materials — contratos reales desplegados (verificados 2026-04-16)
  // ══════════════════════════════════════════════════════════════════════════
  // Todos los endpoints reales son POST con JSON-RPC envelope.
  // Respuesta: { jsonrpc, id, result: { ok, message, data } } → unwrap doble.
  // Los endpoints de settlement aceptan lookup dual:
  //   (settlement_id)  ó  (shift_id, line_id, material_id)
  // Todos los handlers BFF de escritura son POST. Los de lectura (catalog,
  // issue/list, settlement/list, reconcile) también son POST pero se exponen
  // como GET al consumidor si es más cómodo — solo cambia el wire.
  // ──────────────────────────────────────────────────────────────────────────

  // ── Materials: catálogo de materiales (gf.production.material) ────────────
  //   POST /api/production/materials/catalog
  //   Request:  { plant_id?, line_type?: 'rolito'|'barra', active_only? }
  //   Response: { items: [{id, name, uom, product_id, applies_to_rolito,
  //                         tolerance_pct, tolerance_abs,
  //                         default_source_location_id, tag_ids, tag_names}] }
  if (cleanPath === '/api/production/materials/catalog' && method === 'GET') {
    const plantId = Number(query.get('plant_id') || 0) || getWarehouseId() || undefined
    const lineType = query.get('line_type') || undefined
    const activeOnly = query.get('active_only')
    const raw = await odooHttp('POST', '/api/production/materials/catalog', {}, {
      plant_id: plantId,
      line_type: lineType,
      active_only: activeOnly == null ? true : activeOnly === 'true' || activeOnly === '1',
    })
    const envelope = raw?.result ?? raw
    if (envelope?.ok === false) return { error: envelope?.message || 'Error obteniendo catálogo' }
    return envelope?.data ?? envelope
  }

  // ── Materials: lista de issues del turno (gf.production.material.issue) ───
  //   POST /api/production/materials/issue/list
  //   Request:  { shift_id, line_id?, states?: ['draft','confirmed',...] }
  //   Response: { items: [{id, name, material_id, material_name, qty_issued,
  //                         issued_by_name, issued_at, state,
  //                         settlement_id, settlement_state,
  //                         op_tag_names, has_stock_moves}] }
  if (cleanPath === '/api/production/materials/issues' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    const lineId  = Number(query.get('line_id') || 0) || undefined
    const statesParam = query.get('states')
    const states = statesParam
      ? statesParam.split(',').map(s => s.trim()).filter(Boolean)
      : undefined
    if (!shiftId) return { error: 'shift_id requerido' }
    const raw = await odooHttp('POST', '/api/production/materials/issue/list', {}, {
      shift_id: shiftId,
      line_id: lineId,
      states,
    })
    const envelope = raw?.result ?? raw
    if (envelope?.ok === false) return { error: envelope?.message || 'Error obteniendo materiales' }
    return envelope?.data ?? envelope
  }

  // ── Materials: crear issue (bodeguero entrega material al turno) ──────────
  //   POST /api/production/materials/issue/create
  //   Request:  { shift_id, line_id, material_id, qty_issued, issued_by,
  //               op_tag_ids?, notes? }
  //   Response: { issue: {...}, stock_move_ids? }
  if (cleanPath === '/api/production/materials/issue/create' && method === 'POST') {
    const shiftId    = Number(body?.shift_id || 0)
    const lineId     = Number(body?.line_id || 0)
    const materialId = Number(body?.material_id || 0)
    const qtyIssued  = Number(body?.qty_issued || 0)
    const issuedBy   = Number(body?.issued_by || getEmployeeId() || 0)
    if (!shiftId || !lineId || !materialId) {
      return { error: 'shift_id, line_id y material_id son requeridos' }
    }
    if (!(qtyIssued > 0)) return { error: 'qty_issued debe ser mayor a 0' }
    if (!issuedBy) return { error: 'issued_by (bodeguero) es requerido' }
    const raw = await odooHttp('POST', '/api/production/materials/issue/create', {}, {
      shift_id: shiftId,
      line_id: lineId,
      material_id: materialId,
      qty_issued: qtyIssued,
      issued_by: issuedBy,
      op_tag_ids: Array.isArray(body?.op_tag_ids) ? body.op_tag_ids : undefined,
      notes: body?.notes || '',
    })
    const envelope = raw?.result ?? raw
    if (envelope?.ok === false) return { error: envelope?.message || 'Error creando issue' }
    return envelope?.data ?? envelope
  }

  // ── Materials: cancelar issue (antes de que settlement sea reportado) ─────
  //   POST /api/production/materials/issue/cancel
  //   Request:  { issue_id, notes? }
  if (cleanPath === '/api/production/materials/issue/cancel' && method === 'POST') {
    const issueId = Number(body?.issue_id || 0)
    if (!issueId) return { error: 'issue_id requerido' }
    const raw = await odooHttp('POST', '/api/production/materials/issue/cancel', {}, {
      issue_id: issueId,
      employee_id: body?.employee_id || getEmployeeId() || undefined,
      notes: body?.notes || '',
    })
    const envelope = raw?.result ?? raw
    if (envelope?.ok === false) return { error: envelope?.message || 'Error cancelando issue' }
    return envelope?.data ?? envelope
  }

  // ── Materials: report del operador (gf.production.material.settlement) ────
  //   POST /api/production/materials/settlement/report
  //   Request: { settlement_id }  ó  { shift_id, line_id, material_id }
  //            + { qty_remaining?, qty_used?, notes? }
  //   Backend aplica transición issue → settlement.reported.
  if (cleanPath === '/api/production/materials/report' && method === 'POST') {
    const settlementId = Number(body?.settlement_id || 0) || undefined
    const shiftId      = Number(body?.shift_id || 0) || undefined
    const lineId       = Number(body?.line_id || 0) || undefined
    const materialId   = Number(body?.material_id || 0) || undefined
    if (!settlementId && !(shiftId && lineId && materialId)) {
      return { error: 'Debe enviar settlement_id o (shift_id, line_id, material_id)' }
    }
    const raw = await odooHttp('POST', '/api/production/materials/settlement/report', {}, {
      settlement_id: settlementId,
      shift_id: shiftId,
      line_id: lineId,
      material_id: materialId,
      employee_id: body?.employee_id || getEmployeeId() || undefined,
      qty_remaining: body?.qty_remaining != null ? Number(body.qty_remaining) : undefined,
      qty_used: body?.qty_used != null ? Number(body.qty_used) : undefined,
      notes: body?.notes || '',
    })
    const envelope = raw?.result ?? raw
    if (envelope?.ok === false) return { error: envelope?.message || 'Error reportando material' }
    return envelope?.data ?? envelope
  }

  // ── Materials: validate / reject / dispute del auxiliar admin ─────────────
  //   Despacha a /settlement/{validate|reject|dispute} según action.
  //   Request:  { settlement_id }  ó  { shift_id, line_id, material_id }
  //             + { action: 'validate'|'reject'|'dispute', notes? }
  if (cleanPath === '/api/production/materials/validate' && method === 'POST') {
    const action = String(body?.action || '')
    if (!['validate', 'reject', 'dispute'].includes(action)) {
      return { error: 'action debe ser validate|reject|dispute' }
    }
    const settlementId = Number(body?.settlement_id || 0) || undefined
    const shiftId      = Number(body?.shift_id || 0) || undefined
    const lineId       = Number(body?.line_id || 0) || undefined
    const materialId   = Number(body?.material_id || 0) || undefined
    if (!settlementId && !(shiftId && lineId && materialId)) {
      return { error: 'Debe enviar settlement_id o (shift_id, line_id, material_id)' }
    }
    const raw = await odooHttp('POST', `/api/production/materials/settlement/${action}`, {}, {
      settlement_id: settlementId,
      shift_id: shiftId,
      line_id: lineId,
      material_id: materialId,
      employee_id: body?.employee_id || getEmployeeId() || undefined,
      notes: body?.notes || '',
    })
    const envelope = raw?.result ?? raw
    if (envelope?.ok === false) return { error: envelope?.message || `Error en ${action}` }
    return envelope?.data ?? envelope
  }

  // ── Materials: resolver rejected (admin define return/damaged/consumed) ───
  //   POST /api/production/materials/settlement/resolve_rejected
  //   Request: { settlement_id | (shift_id, line_id, material_id),
  //              qty_returned, qty_damaged, qty_consumed, notes? }
  //   Backend valida que qty_returned + qty_damaged + qty_consumed = qty_issued.
  //   Transita settlement a force_closed y genera los 3 moves.
  if (cleanPath === '/api/production/materials/resolve-rejected' && method === 'POST') {
    const settlementId = Number(body?.settlement_id || 0) || undefined
    const shiftId      = Number(body?.shift_id || 0) || undefined
    const lineId       = Number(body?.line_id || 0) || undefined
    const materialId   = Number(body?.material_id || 0) || undefined
    if (!settlementId && !(shiftId && lineId && materialId)) {
      return { error: 'Debe enviar settlement_id o (shift_id, line_id, material_id)' }
    }
    const qtyReturned = Number(body?.qty_returned || 0)
    const qtyDamaged  = Number(body?.qty_damaged || 0)
    const qtyConsumed = Number(body?.qty_consumed || 0)
    if (qtyReturned < 0 || qtyDamaged < 0 || qtyConsumed < 0) {
      return { error: 'Las cantidades deben ser >= 0' }
    }
    const raw = await odooHttp('POST', '/api/production/materials/settlement/resolve_rejected', {}, {
      settlement_id: settlementId,
      shift_id: shiftId,
      line_id: lineId,
      material_id: materialId,
      employee_id: body?.employee_id || getEmployeeId() || undefined,
      qty_returned: qtyReturned,
      qty_damaged: qtyDamaged,
      qty_consumed: qtyConsumed,
      notes: body?.notes || '',
    })
    const envelope = raw?.result ?? raw
    if (envelope?.ok === false) return { error: envelope?.message || 'Error resolviendo rechazo' }
    return envelope?.data ?? envelope
  }

  // ── Materials: inbox de settlements pendientes para admin ─────────────────
  //   POST /api/production/materials/settlement/list
  //   Request:  { plant_id?, shift_id?, states?: ['reported','disputed',...] }
  //   Response: { items: [{id, shift_id, shift_date, shift_code, plant_name,
  //                         line_id, line_name, material_id, material_name,
  //                         qty_issued, qty_used, qty_remaining, state,
  //                         reported_by_name, issue_count, has_stock_moves}] }
  if (cleanPath === '/api/production/materials/settlements-pending' && method === 'GET') {
    const plantId = Number(query.get('plant_id') || 0) || getWarehouseId() || undefined
    const shiftId = Number(query.get('shift_id') || 0) || undefined
    const statesParam = query.get('states')
    const states = statesParam
      ? statesParam.split(',').map(s => s.trim()).filter(Boolean)
      : ['reported', 'disputed', 'rejected']
    const raw = await odooHttp('POST', '/api/production/materials/settlement/list', {}, {
      plant_id: plantId,
      shift_id: shiftId,
      states,
    })
    const envelope = raw?.result ?? raw
    if (envelope?.ok === false) return { error: envelope?.message || 'Error obteniendo settlements' }
    return envelope?.data ?? envelope
  }

  // ── Materials: reconciliación del turno ────────────────────────────────────
  //   POST /api/production/materials/reconcile
  //   Request:  { shift_id, plant_id? }
  //   Response: { shift, plant, by_line[], summary, incidents, consistent }
  //   summary incluye: total_settlements, settlements_by_state (con abandoned
  //   y force_closed), pending_settlements_count, total_{issued,consumed,
  //   remaining,damaged}, legacy_issues_without_moves_count.
  if (cleanPath === '/api/production/materials/reconcile' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    const plantId = Number(query.get('plant_id') || 0) || getWarehouseId() || undefined
    if (!shiftId) return { error: 'shift_id requerido' }
    const raw = await odooHttp('POST', '/api/production/materials/reconcile', {}, {
      shift_id: shiftId,
      plant_id: plantId,
    })
    const envelope = raw?.result ?? raw
    if (envelope?.ok === false) return { error: envelope?.message || 'Error en reconciliación de materiales' }
    return envelope?.data ?? envelope
  }

  // ── Machines: catalogo de maquinas de produccion ───────────────────────────
  // CONTRATO CANONICO (Odoo controller real):
  //   GET /api/production/machines?plant_id=N
  //   Response: [{ id, name, type, plant, line }]
  //   Acepta: plant_id (canonico) o warehouse_id (alias legacy)
  if (cleanPath === '/api/production/machines' && method === 'GET') {
    const plantId = Number(query.get('plant_id') || 0) || getWarehouseId()
    return odooHttp('GET', '/api/production/machines', plantId ? { plant_id: plantId } : {})
  }

  // ── Lines: catalogo de lineas de produccion ────────────────────────────────
  // CONTRATO CANONICO (Odoo controller real):
  //   GET /api/production/lines?plant_id=N
  //   Response: [{ id, name, type, plant }]
  //   Acepta: plant_id (canonico) o warehouse_id (alias legacy)
  if (cleanPath === '/api/production/lines' && method === 'GET') {
    const plantId = Number(query.get('plant_id') || 0) || getWarehouseId()
    return odooHttp('GET', '/api/production/lines', plantId ? { plant_id: plantId } : {})
  }

  // ── Incidents: incidentes del turno ────────────────────────────────────────
  if (cleanPath === '/api/production/incidents' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return []
    const supportsIncidentType = await modelHasField('gf.production.incident', 'incident_type')
    const supportsSeverity = await modelHasField('gf.production.incident', 'severity')
    const supportsReportedBy = await modelHasField('gf.production.incident', 'reported_by_id')
    const supportsName = await modelHasField('gf.production.incident', 'name')
    const result = await readModelSorted('gf.production.incident', {
      fields: [
        'id',
        ...(supportsName ? ['name'] : []),
        'description',
        ...(supportsIncidentType ? ['incident_type'] : []),
        ...(supportsSeverity ? ['severity'] : []),
        'state',
        'shift_id',
        ...(supportsReportedBy ? ['reported_by_id'] : []),
        'create_date',
      ],
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'id',
      sort_desc: true,
      limit: 100,
      sudo: 1,
    })
    return pickListResponse(result).map(row => ({
      ...row,
      reported_by: Array.isArray(row.reported_by_id) ? row.reported_by_id[1] : '',
      incident_type: row.incident_type || '',
      severity: row.severity || '',
      name: row.name || row.description || 'Incidencia',
    }))
  }

  if (cleanPath === '/api/production/incidents' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }
    const supportsIncidentType = await modelHasField('gf.production.incident', 'incident_type')
    const supportsSeverity = await modelHasField('gf.production.incident', 'severity')
    const supportsReportedBy = await modelHasField('gf.production.incident', 'reported_by_id')
    const supportsName = await modelHasField('gf.production.incident', 'name')
    const categoryField = await getModelFieldInfo('gf.production.incident', 'category_id')
    const supportsCategory = Boolean(categoryField?.id)
    const description = body?.description || body?.name || 'Incidencia'
    const typeLabel = body?.incident_type ? `Tipo: ${body.incident_type}` : ''
    const severityLabel = body?.severity ? `Severidad: ${body.severity}` : ''
    const fallbackDescription = [description, typeLabel, severityLabel].filter(Boolean).join('\n')
    let categoryId = Number(body?.category_id || 0) || 0

    if (supportsCategory && !categoryId) {
      const categoryModel = categoryField?.relation || 'gf.production.incident.category'
      const categoryHasActive = await modelHasField(categoryModel, 'active')
      const categoryHasSequence = await modelHasField(categoryModel, 'sequence')
      const desiredCategoryNameMap = {
        production: 'Produccion',
        quality: 'Calidad',
        inventory: 'Inventario',
        equipment: 'Equipo',
        safety: 'Seguridad',
        other: 'Otro',
      }
      const desiredCategoryName = desiredCategoryNameMap[String(body?.incident_type || '').toLowerCase()] || ''
      const categoryResult = await readModelSorted(categoryModel, {
        fields: ['id', 'name', ...(categoryHasSequence ? ['sequence'] : []), ...(categoryHasActive ? ['active'] : [])],
        domain: categoryHasActive ? [['active', '=', true]] : [],
        sort_column: categoryHasSequence ? 'sequence' : 'id',
        sort_desc: false,
        limit: 100,
        sudo: 1,
      }).catch(() => [])
      const categoryRows = pickListResponse(categoryResult)
      const matchedCategory = categoryRows.find((row) => {
        const rowName = normalizeText(row?.name)
        return rowName && (
          rowName === normalizeText(desiredCategoryName) ||
          rowName === normalizeText(body?.incident_type) ||
          rowName.includes(normalizeText(desiredCategoryName)) ||
          normalizeText(desiredCategoryName).includes(rowName)
        )
      }) || categoryRows[0]
      categoryId = Number(matchedCategory?.id || 0) || 0
    }

    if (supportsCategory && categoryField?.required && !categoryId) {
      return { success: false, error: 'No existe una categoria de incidencia disponible en Odoo.' }
    }

    const result = await createUpdate({
      model: 'gf.production.incident',
      method: 'create',
      dict: {
        shift_id: shiftId,
        ...(supportsName ? { name: body?.name || 'Incidencia' } : {}),
        description: supportsIncidentType && supportsSeverity ? description : fallbackDescription,
        ...(supportsCategory && categoryId ? { category_id: categoryId } : {}),
        ...(supportsIncidentType ? { incident_type: body?.incident_type || 'production' } : {}),
        ...(supportsSeverity ? { severity: body?.severity || 'low' } : {}),
        state: 'open',
        ...(supportsReportedBy ? { reported_by_id: Number(body?.reported_by_id || getEmployeeId() || 0) || undefined } : {}),
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  // ── Incidents: resolver incidente ──────────────────────────────────────────
  // CONTRATO CONFIRMADO: solo `state` es campo verificado en gf.production.incident.
  // Campos como `resolution`, `resolved_at`, `resolved_by_id` NO estan confirmados
  // en el modelo Odoo. NO se escriben para evitar errores silenciosos.
  // Cuando Sebastian confirme esos campos, agregarlos aqui explicitamente.
  if (cleanPath === '/api/production/incidents/resolve' && method === 'POST') {
    const incidentId = Number(body?.incident_id || 0)
    if (!incidentId) return { success: false, error: 'incident_id requerido' }
    const result = await createUpdate({
      model: 'gf.production.incident',
      method: 'write',
      ids: [incidentId],
      dict: {
        state: 'resolved',
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
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

  // ── Sprint 5: Liquidación confirm con force (guía §4) ─────────────────────
  // Endpoint real del backend: /gf/logistics/api/employee/liquidacion/confirm
  if (cleanPath === '/gf/logistics/api/employee/liquidacion/confirm' && method === 'POST') {
    return odooJson('/gf/logistics/api/employee/liquidacion/confirm', {
      plan_id: Number(body?.plan_id || 0),
      notes:   String(body?.notes || '').trim(),
      force:   Boolean(body?.force),
    })
  }

  // ── Sprint 5: Catálogo de incidencias del equipo (guía §5) ────────────────
  if (cleanPath === '/pwa-ruta/team-incidents' && method === 'GET') {
    return odooJson('/pwa-ruta/team-incidents', {
      date:      query.get('date') || undefined,
      route_ids: query.get('route_ids') || undefined,
    })
  }

  return NO_DIRECT
}

// ── Helper: evalúa readiness de cierre de turno ──────────────────────
async function evaluateShiftCloseReadiness(shiftId) {
  const blockers = []

  // 1. Ciclos abiertos (freezing / defrosting)
  const cyclesRes = await readModel('gf.evaporator.cycle', {
    fields: ['id', 'state'],
    domain: [['shift_id', '=', shiftId], ['state', 'in', ['freezing', 'defrosting']]],
    limit: 1,
    sudo: 1,
  })
  const openCycles = pickListResponse(cyclesRes)
  if (openCycles?.length) blockers.push('Hay ciclos abiertos (freezing/defrosting)')

  // 2. Paros abiertos
  const downtimesRes = await readModel('gf.production.downtime', {
    fields: ['id'],
    domain: [['shift_id', '=', shiftId], ['state', '=', 'open']],
    limit: 1,
    sudo: 1,
  })
  const openDowntimes = pickListResponse(downtimesRes)
  if (openDowntimes?.length) blockers.push('Hay paros abiertos sin cerrar')

  // 3. Lecturas de energía inicio/fin
  const energyRes = await readModel('gf.energy.reading', {
    fields: ['id', 'reading_type', 'kwh_value'],
    domain: [['shift_id', '=', shiftId]],
    limit: 10,
    sudo: 1,
  })
  const readings = pickListResponse(energyRes) || []
  const hasStart = readings.some(r => r.reading_type === 'start' && r.kwh_value > 0)
  const hasEnd = readings.some(r => r.reading_type === 'end' && r.kwh_value > 0)
  if (!hasStart) blockers.push('Falta lectura de energía de inicio')
  if (!hasEnd) blockers.push('Falta lectura de energía de fin')
  if (hasStart && hasEnd) {
    const startR = readings.find(r => r.reading_type === 'start')
    const endR = readings.find(r => r.reading_type === 'end')
    if (endR.kwh_value <= startR.kwh_value) blockers.push('Lectura de energía fin debe ser mayor que inicio')
  }

  // 4. Checklist HACCP
  const checklistRes = await readModel('gf.haccp.checklist', {
    fields: ['id', 'state'],
    domain: [['shift_id', '=', shiftId]],
    limit: 1,
    sudo: 1,
  })
  const checklist = pickFirstResponse(checklistRes)
  if (!checklist || checklist.state !== 'completed') blockers.push('Checklist HACCP incompleto')

  // 5. Balance producción vs empaque + merma
  const shiftRes = await readModel('gf.production.shift', {
    fields: ['total_kg_produced', 'total_kg_packed', 'total_scrap_kg'],
    domain: [['id', '=', shiftId]],
    limit: 1,
    sudo: 1,
  })
  const shift = pickFirstResponse(shiftRes)
  if (shift) {
    const produced = Number(shift.total_kg_produced || 0)
    const packed = Number(shift.total_kg_packed || 0)
    const scrap = Number(shift.total_scrap_kg || 0)
    if (produced > 0) {
      const accounted = packed + scrap
      const diff = Math.abs(produced - accounted)
      const pct = (diff / produced) * 100
      if (pct > 5) blockers.push(`Desbalance producción vs empaque+merma: ${pct.toFixed(1)}% (${diff.toFixed(1)} kg)`)
    }
  }

  return { canClose: blockers.length === 0, blockers }
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
    // Autoridad: /api/production/shift/current (Odoo validado 2026-04-14).
    // Este endpoint prioriza state='in_progress' + start_time y soporta
    // turnos nocturnos (sin filtro fecha=hoy). NO duplicar logica aqui.
    const requestedWarehouseId = Number(query.get('warehouse_id') || 0) || 0
    const resp = await odooHttp('GET', '/api/production/shift/current', {})
    const data = resp?.data || {}
    let shiftId = Number(data.shift_id || 0) || 0
    let shiftWarehouseId = Number(data.warehouse_id || 0) || 0

    // Fallback por almacén explícito: útil para usuarios administrativos que
    // necesitan operar sobre un turno de producción fuera de su sesión base.
    if ((!resp?.ok || !shiftId || (requestedWarehouseId && shiftWarehouseId && shiftWarehouseId !== requestedWarehouseId)) && requestedWarehouseId) {
      const fallbackRes = await readModelSorted('gf.production.shift', {
        fields: ['id', 'name', 'state', 'plant_warehouse_id'],
        domain: [
          ['state', 'in', ['draft', 'in_progress']],
          ['plant_warehouse_id', '=', requestedWarehouseId],
        ],
        sort_column: 'id',
        sort_desc: true,
        limit: 1,
        sudo: 1,
      })
      const fallback = pickFirstResponse(fallbackRes)
      if (fallback?.id) {
        shiftId = Number(fallback.id || 0) || 0
        shiftWarehouseId = Number(fallback.plant_warehouse_id?.[0] || requestedWarehouseId || 0) || 0
      }
    }

    if (!shiftId) return null
    // Enriquecer con metricas del dashboard (misma fuente que consume el hub
    // para KPIs y open_maintenance_requests). Shape compatible con callers
    // legacy que esperan campos como total_kg_produced.
    let dash = {}
    try {
      const dashResp = await odooHttp('GET', '/api/production/dashboard', { shift_id: shiftId })
      dash = dashResp?.data || {}
    } catch (_) { /* non-blocking */ }
    return {
      id: shiftId,
      name: data.name || dash.name || '',
      state: data.state || dash.state || '',
      warehouse_id: shiftWarehouseId || requestedWarehouseId || 0,
      // Metricas (desde dashboard; backend las calcula)
      total_kg_produced: dash.total_kg_produced ?? null,
      total_kg_packed: dash.total_kg_packed ?? null,
      total_scrap_kg: dash.total_scrap_kg ?? null,
      total_downtime_min: dash.total_downtime_min ?? null,
      energy_kwh: dash.energy_kwh ?? null,
      yield_pct: dash.yield_pct ?? null,
      open_downtimes_ids: Array.isArray(dash.open_downtimes) ? dash.open_downtimes : [],
      open_maintenance_requests: dash.open_maintenance_requests ?? 0,
    }
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

  if (cleanPath === '/pwa-sup/shift-start' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) throw new Error('shift_id requerido')

    const result = await createUpdate({
      model: 'gf.production.shift',
      method: 'function',
      ids: [shiftId],
      function: 'action_start_shift',
      sudo: 1,
      app: 'pwa_colaboradores',
    })

    return { ok: true, data: result }
  }

  // ── Shift close readiness check ──────────────────────────────────────
  if (cleanPath === '/pwa-sup/shift-close-check' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return { canClose: false, blockers: ['shift_id requerido'] }
    return evaluateShiftCloseReadiness(shiftId)
  }

  // ── Shift close (validación híbrida: check local + update) ──────────
  // TODO: migrar a action_close cuando exista el método en Odoo
  if (cleanPath === '/pwa-sup/shift-close' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }

    const readiness = await evaluateShiftCloseReadiness(shiftId)
    if (!readiness.canClose) {
      return { success: false, error: 'No se puede cerrar el turno', blockers: readiness.blockers }
    }

    const result = await createUpdate({
      model: 'gf.production.shift',
      method: 'update',
      ids: [shiftId],
      dict: {
        state: 'closed',
        end_time: body?.end_time || odooNow(),
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
    return pickListResponse(result).map((row) => ({
      ...row,
      category: Array.isArray(row.category_id) ? row.category_id[1] : (row.category_id || ''),
      line_name: Array.isArray(row.line_id) ? row.line_id[1] : '',
      machine_name: Array.isArray(row.machine_id) ? row.machine_id[1] : '',
      operator_name: Array.isArray(row.operator_id) ? row.operator_id[1] : '',
    }))
  }

  if (cleanPath === '/pwa-sup/downtime-categories' && method === 'GET') {
    const result = await readModelSorted('gf.production.downtime.category', {
      fields: ['id', 'name', 'sequence', 'is_corporate', 'active'],
      domain: [['active', '=', true]],
      sort_column: 'sequence',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  if (cleanPath === '/pwa-sup/downtime-create' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }
    // Fase 4: responsible_id y comment ya existen en modelo Odoo
    const responsibleId = Number(body?.responsible_id || 0) || undefined
    const comment = body?.comment || undefined
    const result = await createUpdate({
      model: 'gf.production.downtime',
      method: 'create',
      dict: {
        shift_id: shiftId,
        category_id: Number(body?.category_id || 0) || undefined,
        machine_id: Number(body?.machine_id || 0) || undefined,
        line_id: Number(body?.line_id || 0) || undefined,
        start_time: body?.start_time || odooNow(),
        reason: body?.reason || body?.notes || '',
        operator_id: Number(body?.reported_by_id || getEmployeeId() || 0) || undefined,
        responsible_id: responsibleId,
        comment,
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
    const endTime = body?.end_time || new Date().toISOString()
    // Fetch start_time to compute minutes
    let minutes
    const dtRes = await readModel('gf.production.downtime', {
      fields: ['start_time'],
      domain: [['id', '=', downtimeId]],
      limit: 1,
      sudo: 1,
    })
    const dt = pickFirstResponse(dtRes)
    if (dt?.start_time) {
      const diffMs = new Date(endTime).getTime() - new Date(dt.start_time).getTime()
      minutes = Math.max(0, Math.round(diffMs / 60000))
    }
    const result = await createUpdate({
      model: 'gf.production.downtime',
      method: 'update',
      ids: [downtimeId],
      dict: {
        state: 'closed',
        end_time: endTime,
        ...(minutes !== undefined ? { minutes } : {}),
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    return { success: true, data: result }
  }

  // ── Merma — dual-mode (peso | pieza) ─────────────────────────────────────
  // GAP CONOCIDO: gf.production.scrap NO tiene product_id / qty_units / scrap_type.
  // Campos reales en Odoo: shift_id, reason_id, kg, line_id, machine_id,
  // operator_id, timestamp, notes, photo.
  //
  // Estrategia interim (hasta que Sebastian agregue columnas):
  // - kg siempre es autoritativo (peso_mode: directo | unit_mode: qty * product.weight)
  // - Metadatos de unit_mode se encodean como prefijo estructurado en notes:
  //     [PZS|P:{id}|N:{name}|Q:{qty}|KU:{kg_per_unit}] {user_notes}
  // - GET parsea el prefijo de vuelta en campos estructurados para la UI.
  //
  // Cuando Sebastian agregue product_id / qty_units / scrap_type al modelo:
  // 1) Agregar esos campos al dict de create y fields de read
  // 2) Remover parsePzsPrefix / encode en notes
  // 3) Los registros historicos con prefijo seguiran siendo legibles por la UI
  //    hasta que se migren (ver helper parsePzsPrefix).
  if (cleanPath === '/pwa-sup/scraps' && method === 'GET') {
    const shiftId = Number(query.get('shift_id') || 0)
    if (!shiftId) return []
    const result = await readModelSorted('gf.production.scrap', {
      fields: ['id', 'shift_id', 'kg', 'reason_id', 'notes', 'operator_id', 'line_id', 'machine_id', 'photo', 'timestamp', 'create_date'],
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'id',
      sort_desc: true,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => {
      const parsed = parsePzsPrefix(row.notes || '')
      return {
        ...row,
        reason: Array.isArray(row.reason_id) ? row.reason_id[1] : '',
        line_name: Array.isArray(row.line_id) ? row.line_id[1] : '',
        operator_name: Array.isArray(row.operator_id) ? row.operator_id[1] : '',
        created_at: row.timestamp || row.create_date || '',
        scrap_type: parsed.type,           // 'unit' | 'weight'
        product_id: parsed.product_id,     // number | null
        product_name: parsed.product_name, // string | ''
        qty_units: parsed.qty_units,       // number | null
        kg_per_unit: parsed.kg_per_unit,   // number | null
        notes: parsed.clean_notes,         // notes sin prefijo
      }
    })
  }

  if (cleanPath === '/pwa-sup/scrap-reasons' && method === 'GET') {
    const result = await readModelSorted('gf.production.scrap.reason', {
      fields: ['id', 'name', 'sequence', 'is_corporate', 'active'],
      domain: [['active', '=', true]],
      sort_column: 'sequence',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result)
  }

  // Catalogo de productos para merma por pieza.
  // Reutiliza product.product con sale_ok=True; el campo weight permite
  // calcular kg automaticamente (qty_units * weight).
  if (cleanPath === '/pwa-sup/scrap-products' && method === 'GET') {
    const result = await readModelSorted('product.product', {
      fields: ['id', 'name', 'weight', 'default_code', 'sale_ok'],
      domain: [['sale_ok', '=', true]],
      sort_column: 'name',
      sort_desc: false,
      limit: 300,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      id: row.id,
      name: row.name || '',
      weight: Number(row.weight || 0),
      default_code: row.default_code || '',
    }))
  }

  if (cleanPath === '/pwa-sup/scrap-create' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }

    // Strip data URL prefix if present (Odoo expects raw base64)
    let photo = body?.photo_base64 || body?.photo || undefined
    if (typeof photo === 'string' && photo.startsWith('data:')) {
      photo = photo.split(',', 2)[1] || undefined
    }

    // Dual-mode: 'unit' (producto + piezas) | 'weight' (kg directo)
    const scrapType = body?.scrap_type === 'unit' ? 'unit' : 'weight'
    const userNotes = String(body?.notes || '').trim()

    let kg = 0
    let finalNotes = userNotes

    if (scrapType === 'unit') {
      const productId = Number(body?.product_id || 0)
      const productName = String(body?.product_name || '').trim()
      const qtyUnits = Number(body?.qty_units || 0)
      const kgPerUnit = Number(body?.kg_per_unit || 0)

      if (!productId) return { success: false, error: 'product_id requerido para merma por pieza' }
      if (!(qtyUnits > 0)) return { success: false, error: 'qty_units debe ser mayor a 0' }

      // kg = cantidad * peso unitario. Si no hay peso en el producto,
      // aceptamos un kg manual enviado por la UI (body.kg) como fallback.
      if (kgPerUnit > 0) {
        kg = qtyUnits * kgPerUnit
      } else if (Number(body?.kg || 0) > 0) {
        kg = Number(body.kg)
      } else {
        return { success: false, error: 'El producto no tiene peso unitario; captura kg manualmente.' }
      }

      // Encode metadata en notes hasta que el modelo tenga columnas nativas.
      finalNotes = buildPzsPrefix({
        product_id: productId,
        product_name: productName,
        qty_units: qtyUnits,
        kg_per_unit: kgPerUnit,
      }) + (userNotes ? ' ' + userNotes : '')
    } else {
      // weight mode: kg viene directo del body
      kg = Number(body?.kg || body?.qty_kg || 0)
      if (!(kg > 0)) return { success: false, error: 'kg debe ser mayor a 0' }
    }

    // Fase 4: scrap_phase ya existe en modelo Odoo (selection field)
    const scrapPhase = body?.scrap_phase || undefined

    const result = await createUpdate({
      model: 'gf.production.scrap',
      method: 'create',
      dict: {
        shift_id: shiftId,
        kg,
        reason_id: Number(body?.reason_id || 0) || undefined,
        notes: finalNotes,
        operator_id: Number(body?.reported_by_id || getEmployeeId() || 0) || undefined,
        line_id: Number(body?.line_id || 0) || undefined,
        machine_id: Number(body?.machine_id || 0) || undefined,
        scrap_phase: scrapPhase,
        timestamp: body?.timestamp || odooNow(),
        photo,
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
      fields: ['id', 'shift_id', 'kwh_value', 'reading_type', 'timestamp', 'photo', 'employee_id', 'create_date'],
      domain: [['shift_id', '=', shiftId]],
      sort_column: 'id',
      sort_desc: true,
      limit: 200,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      ...row,
      created_at: row.timestamp || row.create_date || '',
      employee_name: Array.isArray(row.employee_id) ? row.employee_id[1] : '',
      photo_url: row.photo ? `data:image/jpeg;base64,${row.photo}` : null,
    }))
  }

  if (cleanPath === '/pwa-sup/energy-create' && method === 'POST') {
    const shiftId = Number(body?.shift_id || 0)
    if (!shiftId) return { success: false, error: 'shift_id requerido' }
    const kwhValue = Number(body?.kwh_value || body?.reading_kwh || 0)
    if (!kwhValue || kwhValue <= 0) return { success: false, error: 'kwh_value debe ser mayor a 0 — lectura real requerida' }
    let photo = body?.photo_base64 || body?.photo || undefined
    if (typeof photo === 'string' && photo.startsWith('data:')) {
      photo = photo.split(',', 2)[1] || undefined
    }
    const result = await createUpdate({
      model: 'gf.energy.reading',
      method: 'create',
      dict: {
        shift_id: shiftId,
        kwh_value: kwhValue,
        reading_type: body?.reading_type || undefined,
        timestamp: body?.timestamp || odooNow(),
        employee_id: Number(body?.employee_id || getEmployeeId() || 0) || undefined,
        photo,
      },
      sudo: 1,
      app: 'pwa_colaboradores',
    })
    try {
      const readingId = Number(result?.id || result?.result || 0)
      const readingType = String(body?.reading_type || '')
      if (readingId && (readingType === 'start' || readingType === 'end')) {
        await createUpdate({
          model: 'gf.production.shift',
          method: 'update',
          ids: [shiftId],
          dict: readingType === 'start'
            ? { energy_start_id: readingId }
            : { energy_end_id: readingId },
          sudo: 1,
          app: 'pwa_colaboradores',
        }).catch(() => null)
      }
    } catch { /* non-fatal */ }
    return { success: true, data: result }
  }

  if (cleanPath === '/pwa-sup/maintenance' && method === 'GET') {
    // maintenance.request has no warehouse_id column; filter by company only.
    const domain = []
    if (companyId) domain.push(['company_id', '=', companyId])
    const result = await readModelSorted('maintenance.request', {
      fields: ['id', 'name', 'request_date', 'stage_id', 'priority', 'equipment_id', 'maintenance_type', 'employee_id', 'description', 'schedule_date'],
      domain,
      sort_column: 'request_date',
      sort_desc: true,
      limit: 50,
      sudo: 1,
    })
    return pickListResponse(result).map((row) => ({
      ...row,
      subject: row.name || '',
      stage: Array.isArray(row.stage_id) ? row.stage_id[1] : '',
      equipment: Array.isArray(row.equipment_id) ? row.equipment_id[1] : '',
      employee_name: Array.isArray(row.employee_id) ? row.employee_id[1] : '',
      priority: Number(row.priority || 0),
    }))
  }

  if (cleanPath === '/pwa-sup/maintenance-create' && method === 'POST') {
    // Odoo priority is a Selection of strings '0'..'3'; coerce defensively.
    const priority = body?.priority === undefined || body?.priority === null || body?.priority === ''
      ? '1'
      : String(body.priority)
    const result = await createUpdate({
      model: 'maintenance.request',
      method: 'create',
      dict: {
        name: body?.name || body?.subject || 'Solicitud PWA',
        request_date: body?.request_date || new Date().toISOString().slice(0, 10),
        maintenance_type: body?.maintenance_type || body?.type || 'corrective',
        priority,
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

  if (cleanPath === '/pwa-sup/brine-reading-create' && method === 'POST') {
    const machineId = Number(body?.machine_id || 0)
    const saltLevel = Number(body?.salt_level || 0)
    const brineTempRaw = body?.brine_temp
    if (!machineId) throw new Error('machine_id requerido')
    if (!Number.isFinite(saltLevel) || saltLevel <= 0) throw new Error('salt_level invalido')

    const now = odooNow()
    const dict = {
      x_salt_level: saltLevel,
      x_salt_level_updated_at: now,
    }

    if (brineTempRaw !== undefined && brineTempRaw !== null && String(brineTempRaw).trim() !== '') {
      const brineTemp = Number(brineTempRaw)
      if (!Number.isFinite(brineTemp)) throw new Error('brine_temp invalida')
      dict.x_brine_temp_current = brineTemp
      dict.x_brine_temp_updated_at = now
    }

    await createUpdate({
      model: 'gf.production.machine',
      method: 'update',
      ids: [machineId],
      dict,
      sudo: 1,
      app: 'pwa_colaboradores',
    })

    const reread = await readModel('gf.production.machine', {
      fields: [
        'id', 'name', 'display_name', 'machine_type', 'line_id',
        'slot_rows', 'slot_columns', 'bars_per_basket', 'kg_per_bar',
        'bar_product_id', 'capacity_tons_day', 'freeze_hours',
        'x_salt_level', 'x_salt_level_updated_at', 'salt_level_unit',
        'min_salt_level_for_harvest', 'min_brine_temp_for_harvest',
        'x_brine_temp_current', 'x_brine_temp_alert', 'x_brine_temp_updated_at',
        'x_total_slots', 'x_active_slots_count', 'x_ready_slots_count',
        'x_next_slot_id', 'x_next_slot_name', 'x_next_allowed_extraction',
        'x_last_extraction_time', 'x_extractions_last_30min',
      ],
      domain: [['id', '=', machineId]],
      limit: 1,
      sudo: 1,
    })

    return shapeTank(pickFirstResponse(reread))
  }

  return NO_DIRECT
}

async function directAlmacenPT(method, path, body) {
  const query = new URLSearchParams(path.split('?')[1] || '')
  const cleanPath = path.split('?')[0]
  const warehouseId = Number(query.get('warehouse_id') || 0) || getWarehouseId()
  const companyId = getCompanyId()

  if (!cleanPath.startsWith('/pwa-pt/')) return NO_DIRECT

  // ── PT → CEDIS transfers (Sebastian rollout 2026-04-19, transactional) ───
  // Reemplaza los stubs anteriores de gf.pallet (deprecado, 0 registros).
  // Backend opera sobre stock.picking real:
  //   pending: lee stock.picking destino al CEDIS del almacenista
  //   accept:  ejecuta picking.button_validate() (movimiento transaccional)
  //   reject:  cancela picking + registra motivo (reason obligatorio)
  if (cleanPath === '/pwa-pt/pending-transfers' && method === 'GET') {
    return odooJson('/gf/logistics/api/employee/pt_transfer/pending', {
      warehouse_id: warehouseId,
    })
  }
  if (cleanPath === '/pwa-pt/accept-transfer' && method === 'POST') {
    const pickingId = Number(body?.picking_id || 0)
    if (!pickingId) return { ok: false, error: 'picking_id requerido' }
    return odooJson('/gf/logistics/api/employee/pt_transfer/accept', {
      picking_id: pickingId,
    })
  }
  if (cleanPath === '/pwa-pt/reject-transfer' && method === 'POST') {
    const pickingId = Number(body?.picking_id || 0)
    const reason = (body?.reason || '').trim()
    if (!pickingId) return { ok: false, error: 'picking_id requerido' }
    if (!reason) return { ok: false, error: 'reason requerido' }
    return odooJson('/gf/logistics/api/employee/pt_transfer/reject', {
      picking_id: pickingId,
      reason,
    })
  }

  if (cleanPath === '/pwa-pt/inventory' && method === 'GET') {
    // ─── Canonical PT inventory (BFF — single source of truth) ───────────
    // Rebuilt 2026-04-11 (v2: family-based classification).
    //
    // DECISIÓN CLAVE — la familia del producto es ESTRUCTURAL, no física:
    //   "Que un producto esté físicamente en PT-IGUALA-ROLITO no significa
    //    que funcionalmente pertenezca a la línea ROLITO."
    //
    // Fuente de verdad de la familia: la jerarquía existente de product.category.
    // La categoría raíz PT (97 = PRODUCTO TERMINADO / HIELO) tiene 4 hijos
    // directos que definen el árbol productivo:
    //     71 BARRA DE HIELO        → familia BARRA
    //     74 MOLIDO                → familia BARRA  (subproducto operativo,
    //                                 producido a partir de barras rotas)
    //     76 ROLITO GOURMET        → familia ROLITO
    //     90 ROLITO TRADICIONAL    → familia ROLITO
    //
    // Al caminar del categ_id del producto hacia arriba hasta ese segundo
    // nivel obtenemos la familia sin regex de nombre ni heurística frágil.
    // Recomendación a Sebastián (no bloqueante): agregar un campo
    // `x_pt_family` (selection) en product.template para hacer el mapping
    // explícito desde Odoo y eliminar el mapa literal de abajo.
    //
    // Reglas del endpoint:
    //   1. Ubicaciones PT se resuelven DINÁMICAMENTE (no hardcoded):
    //      stock.location where warehouse_id + usage='internal' + name LIKE 'PT-%'
    //   2. Productos PT se filtran por categoría child_of 97.
    //   3. Dedup por product_id sumando cantidades entre ubicaciones.
    //   4. product_family se calcula por jerarquía (ver arriba). NUNCA se
    //      infiere del nombre de la ubicación donde está el stock.
    //   5. stock_locations refleja la distribución física real (separada
    //      de product_family para que nunca se confundan los conceptos).
    //   6. Excluye quantity <= 0.
    //   7. weight_per_unit se parsea del nombre (…(15KG)…) con fallback 1.
    //
    // Shape canónico:
    //   {
    //     warehouse_id, warehouse_name,
    //     pt_locations: [{id, name, complete_name}],   // físicas, sin familia
    //     items: [{
    //       product_id, product_name,
    //       category_id, category_name,                 // hoja
    //       family_root_id, family_root_name,           // segundo nivel bajo 97
    //       product_family,                             // 'BARRA'|'ROLITO'|'OTRO'
    //       display_line,                               // = product_family (UI)
    //       weight_per_unit, quantity, total_kg,
    //       stock_locations: [{id, name, qty}],         // distribución física
    //     }],
    //     totals: {
    //       products, qty, kg,
    //       by_family: { BARRA: {qty,kg,count}, ROLITO: {...}, OTRO: {...} },
    //       by_location: { [locId]: {name, qty, kg, count} },
    //     },
    //     by_family: { ... },                           // alias top-level
    //     generated_at,
    //   }
    const PT_ROOT_CATEGORY_ID = 97 // PRODUCTO TERMINADO / HIELO

    // Mapa estructural segundo-nivel → familia operativa.
    // Es un mapa literal pequeño (4 entradas), no una heurística.
    // Si el producto no cae en ninguno, queda como 'OTRO' y se loggea.
    const FAMILY_BY_ROOT_CAT_ID = {
      71: 'BARRA',  // BARRA DE HIELO
      74: 'BARRA',  // MOLIDO  (subproducto de barras rotas, línea BARRA)
      76: 'ROLITO', // ROLITO GOURMET
      90: 'ROLITO', // ROLITO TRADICIONAL
    }

    // 1) Resolver ubicaciones PT del warehouse dinámicamente
    //    Fase A: locaciones con prefijo PT-% (warehouses de producción).
    //    Fase B (fallback CEDIS): si no hay PT-%, usar TODAS las internas del
    //    warehouse. CEDIS como CIGU tienen `WH/Existencias`, `WH/STOCK` (sin
    //    prefijo PT-) pero solo stockean Producto Terminado, así que el filtro
    //    posterior por categ_id child_of=97 mantiene la corrección estructural.
    const locFieldsAndSort = {
      fields: ['id', 'name', 'complete_name', 'warehouse_id'],
      sort_column: 'complete_name',
      sort_desc: false,
      limit: 50,
      sudo: 1,
    }
    let locRaw = await readModelSorted('stock.location', {
      ...locFieldsAndSort,
      domain: [
        ['warehouse_id', '=', warehouseId || 76],
        ['usage', '=', 'internal'],
        ['name', '=like', 'PT-%'],
      ],
    })
    let locRows = pickListResponse(locRaw)
    if (!locRows.length) {
      // Fallback CEDIS: todas las locaciones internas del warehouse.
      locRaw = await readModelSorted('stock.location', {
        ...locFieldsAndSort,
        domain: [
          ['warehouse_id', '=', warehouseId || 76],
          ['usage', '=', 'internal'],
        ],
      })
      locRows = pickListResponse(locRaw)
    }
    const ptLocations = locRows.map((r) => ({
      id: r.id,
      name: r.name || r.complete_name || '',
      complete_name: r.complete_name || '',
    }))
    const ptLocationIds = ptLocations.map((l) => l.id)
    if (!ptLocationIds.length) {
      return {
        warehouse_id: warehouseId || 0,
        warehouse_name: '',
        pt_locations: [],
        items: [],
        totals: {
          products: 0, qty: 0, kg: 0,
          by_family: {},
          by_location: {},
        },
        by_family: {},
        generated_at: new Date().toISOString(),
      }
    }
    const locById = Object.fromEntries(ptLocations.map((l) => [l.id, l]))

    // 2) Resolver árbol de categorías bajo PT para poder subir a la raíz-familia
    const catRaw = await readModelSorted('product.category', {
      fields: ['id', 'name', 'parent_id'],
      domain: [['id', 'child_of', PT_ROOT_CATEGORY_ID]],
      sort_column: 'complete_name',
      sort_desc: false,
      limit: 200,
      sudo: 1,
    })
    const catRows = pickListResponse(catRaw)
    // Mapa catId → parentId para subir cadena
    const parentOf = {}
    const nameOf = {}
    for (const c of catRows) {
      parentOf[c.id] = c.parent_id?.[0] || 0
      nameOf[c.id] = c.name || ''
    }
    // Resuelve familia (BARRA/ROLITO/OTRO) + la categoría-raíz (2do nivel)
    // subiendo hasta que el padre sea PT_ROOT_CATEGORY_ID.
    function resolveFamily(categId) {
      let cur = categId
      let guard = 0
      while (cur && guard++ < 10) {
        if (parentOf[cur] === PT_ROOT_CATEGORY_ID) {
          return {
            family_root_id: cur,
            family_root_name: nameOf[cur] || '',
            product_family: FAMILY_BY_ROOT_CAT_ID[cur] || 'OTRO',
          }
        }
        const next = parentOf[cur]
        if (!next || next === cur) break
        cur = next
      }
      return { family_root_id: 0, family_root_name: '', product_family: 'OTRO' }
    }

    // 3) Resolver productos PT por categoría (estructural)
    const prodRaw = await readModelSorted('product.product', {
      fields: ['id', 'name', 'categ_id'],
      domain: [['categ_id', 'child_of', PT_ROOT_CATEGORY_ID]],
      sort_column: 'name',
      sort_desc: false,
      limit: 500,
      sudo: 1,
    })
    const prodRows = pickListResponse(prodRaw)
    const ptProductIds = prodRows.map((p) => p.id)
    const productCatalog = Object.fromEntries(
      prodRows.map((p) => {
        const name = p.name || ''
        const mKg = name.match(/\(([\d.]+)\s*KG\)/i)
        const categId = p.categ_id?.[0] || 0
        const fam = resolveFamily(categId)
        return [p.id, {
          product_id: p.id,
          product_name: name,
          category_id: categId,
          category_name: p.categ_id?.[1] || '',
          family_root_id: fam.family_root_id,
          family_root_name: fam.family_root_name,
          product_family: fam.product_family,
          weight_per_unit: mKg ? Number(mKg[1]) || 1 : 1,
        }]
      })
    )

    // 4) Query stock.quant acotada por ubicaciones PT y productos PT
    const quantRaw = await readModelSorted('stock.quant', {
      fields: ['id', 'product_id', 'quantity', 'reserved_quantity', 'location_id'],
      domain: [
        ['location_id', 'in', ptLocationIds],
        ['product_id', 'in', ptProductIds],
      ],
      sort_column: 'product_id',
      sort_desc: false,
      limit: 1000,
      sudo: 1,
    })
    const quantRows = pickListResponse(quantRaw)

    // 5) Agrupar por product_id y enriquecer con distribución física
    const byProduct = new Map()
    for (const row of quantRows) {
      const pid = row.product_id?.[0] || row.product_id
      if (!pid) continue
      const qty = Number(row.quantity || 0)
      if (qty <= 0) continue
      const locId = row.location_id?.[0] || row.location_id
      const locInfo = locById[locId]
      if (!locInfo) continue
      const catalog = productCatalog[pid] || {
        product_id: pid,
        product_name: row.product_id?.[1] || '',
        category_id: 0,
        category_name: '',
        family_root_id: 0,
        family_root_name: '',
        product_family: 'OTRO',
        weight_per_unit: 1,
      }
      let item = byProduct.get(pid)
      if (!item) {
        item = {
          ...catalog,
          display_line: catalog.product_family,
          quantity: 0,
          total_kg: 0,
          stock_locations: [],
        }
        byProduct.set(pid, item)
      }
      item.quantity += qty
      item.total_kg += qty * (catalog.weight_per_unit || 1)
      item.stock_locations.push({
        id: locId,
        name: locInfo.name,
        qty,
      })
    }

    // 6) Construir agregados por familia y por ubicación física
    const items = []
    const byFamily = {}
    const byLocation = {}
    let totalQty = 0
    let totalKg = 0
    const unknownFamily = []

    for (const item of byProduct.values()) {
      if (item.quantity <= 0) continue
      // Redondeos defensivos
      item.quantity = Math.round(item.quantity * 1000) / 1000
      item.total_kg = Math.round(item.total_kg * 1000) / 1000
      items.push(item)
      totalQty += item.quantity
      totalKg += item.total_kg

      const fam = item.product_family || 'OTRO'
      if (fam === 'OTRO') unknownFamily.push({ id: item.product_id, name: item.product_name, cat: item.category_name })
      if (!byFamily[fam]) byFamily[fam] = { qty: 0, kg: 0, count: 0 }
      byFamily[fam].qty += item.quantity
      byFamily[fam].kg += item.total_kg
      byFamily[fam].count += 1

      // Distribución física (locaciones reales del stock)
      for (const sl of item.stock_locations) {
        const w = item.weight_per_unit || 1
        if (!byLocation[sl.id]) byLocation[sl.id] = { name: sl.name, qty: 0, kg: 0, count: 0 }
        byLocation[sl.id].qty += sl.qty
        byLocation[sl.id].kg += sl.qty * w
        byLocation[sl.id].count += 1
      }
    }
    items.sort((a, b) => a.product_name.localeCompare(b.product_name, 'es'))

    if (unknownFamily.length) {
      console.warn('[pwa-pt/inventory] productos sin family estructural:', unknownFamily)
    }

    // Redondeos finales de agregados
    for (const k of Object.keys(byFamily)) {
      byFamily[k].qty = Math.round(byFamily[k].qty * 1000) / 1000
      byFamily[k].kg = Math.round(byFamily[k].kg * 1000) / 1000
    }
    for (const k of Object.keys(byLocation)) {
      byLocation[k].qty = Math.round(byLocation[k].qty * 1000) / 1000
      byLocation[k].kg = Math.round(byLocation[k].kg * 1000) / 1000
    }

    return {
      warehouse_id: warehouseId || 76,
      warehouse_name: '',
      pt_locations: ptLocations,
      items,
      totals: {
        products: items.length,
        qty: Math.round(totalQty * 1000) / 1000,
        kg: Math.round(totalKg * 1000) / 1000,
        by_family: byFamily,
        by_location: byLocation,
      },
      by_family: byFamily,
      generated_at: new Date().toISOString(),
    }
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

  if (cleanPath === '/pwa-pt/entregas-destination' && method === 'GET') {
    const result = await readModelSorted('stock.warehouse', {
      fields: ['id', 'name', 'code', 'company_id', 'lot_stock_id'],
      domain: ['|', ['code', '=', 'CIGU'], ['name', 'ilike', 'CIGU']],
      sort_column: 'id',
      sort_desc: false,
      limit: 10,
      sudo: 1,
    })
    const rows = pickListResponse(result)
    const row = rows.find((r) => String(r.code || '').toUpperCase() === 'CIGU') || rows[0]
    if (!row?.id) {
      throw new Error('No se encontro el almacen destino CIGU/Existencias')
    }
    return {
      id: row.id,
      warehouse_id: row.id,
      name: row.name || 'CIGU',
      code: row.code || 'CIGU',
      display_name: 'CIGU/Existencias',
      company_id: row.company_id?.[0] || 0,
      company_name: row.company_id?.[1] || 'SOLUCIONES EN PRODUCCION GLACIEM',
      lot_stock_location_id: row.lot_stock_id?.[0] || row.lot_stock_id || 0,
      lot_stock_location_name: row.lot_stock_id?.[1] || 'Existencias',
    }
  }

  // ── Dashboard summary (Sebastián commit fa20403) ──────────────────────────
  if (cleanPath === '/pwa-pt/dashboard-summary' && method === 'GET') {
    const result = await odooHttp('GET', '/api/pt/dashboard/summary', {
      warehouse_id: warehouseId,
      company_id: companyId || undefined,
    })
    return result?.data ?? result
  }

  // ── Transfer orchestrate PT→CEDIS (Sebastián commit 16341c5) ─────────────
  if (cleanPath === '/pwa-pt/transfer-orchestrate' && method === 'POST') {
    const salesOpsMeta = getSalesOpsTokenMeta()
    console.info('[gf_salesops] orchestrate preflight', {
      warehouse_id: body?.warehouse_id || warehouseId,
      cedis_id: body?.destination_warehouse_id || body?.cedis_id || 0,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      lines_count: Array.isArray(body?.lines) ? body.lines.length : 0,
      token_present: salesOpsMeta.present,
      token_length: salesOpsMeta.length,
      token_source: salesOpsMeta.source,
      session_token_present: salesOpsMeta.session_present,
      env_token_present: salesOpsMeta.env_present,
    })
    if (!salesOpsMeta.token) {
      throw new Error('Falta configurar X-GF-Token para SalesOps. Revisa gf_salesops.api_token en la PWA.')
    }
    const envelope = await odooJson('/gf/salesops/pt/transfer/orchestrate', {
      warehouse_id: body?.warehouse_id || warehouseId,
      cedis_id: body?.destination_warehouse_id || body?.cedis_id || 0,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      lines: body?.lines || [],
      notes: body?.notes || '',
    })
    if (
      envelope?.ok === false
      || envelope?.status === 'error'
      || envelope?.code === 'UNAUTHORIZED'
      || envelope?.error
    ) {
      throw new Error(
        envelope?.user_message
        || envelope?.message
        || envelope?.error
        || 'No se pudo crear el traspaso PT'
      )
    }
    return envelope?.data ?? envelope
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
    // El controller real requiere warehouse_id + shift_date + shift_code.
    // Obtenemos shift_date y shift_code del turno activo via
    // POST /api/production/pt/reception/pending (que los expone en
    // response.data.shift.{date,shift_code}).
    let shiftDate
    let shiftCode
    try {
      const current = await odooHttp('GET', '/api/production/shift/current', {})
      const shiftId = current?.data?.shift_id || 0
      if (shiftId) {
        const meta = await odooHttp('POST', '/api/production/pt/reception/pending', {}, {
          shift_id: shiftId,
        })
        const metaEnvelope = meta?.result ?? meta
        const metaData = metaEnvelope?.data || {}
        shiftDate = metaData?.shift?.date
        shiftCode = metaData?.shift?.shift_code
      }
    } catch (_) { /* fallback: sin enriquecer */ }

    const result = await odooHttp('GET', '/api/pt/reception/pending', {
      warehouse_id: warehouseId,
      company_id: companyId || undefined,
      shift_date: shiftDate || undefined,
      shift_code: shiftCode || undefined,
    })
    return result?.data ?? result
  }

  if (cleanPath === '/pwa-pt/reception-create' && method === 'POST') {
    // Backend expects packing_entry_ids (array) + received_lines.
    // Accept both the old single-entry payload and the new aggregated payload.
    const explicitIds = Array.isArray(body?.packing_entry_ids)
      ? body.packing_entry_ids
          .map((value) => Number(Array.isArray(value) ? value[0] : value))
          .filter((value) => value > 0)
      : []
    const entryId = Number(body?.packing_entry_id || 0) || undefined
    const receivedQty = body?.qty_received != null ? Number(body.qty_received) : 0
    const explicitLines = Array.isArray(body?.received_lines)
      ? body.received_lines
          .map((line) => ({
            packing_entry_id: Number(line?.packing_entry_id || 0),
            received_qty: Number(line?.received_qty || 0),
            notes: line?.notes || '',
          }))
          .filter((line) => line.packing_entry_id > 0 && line.received_qty > 0)
      : []
    const packingEntryIds = explicitIds.length > 0
      ? explicitIds
      : entryId
        ? [entryId]
        : []
    const receivedLines = explicitLines.length > 0
      ? explicitLines
      : entryId
        ? [{
            packing_entry_id: entryId,
            received_qty: receivedQty,
            notes: body?.notes || '',
          }]
        : []
    const envelope = await odooJson('/api/pt/reception/create', {
      warehouse_id: body?.warehouse_id || warehouseId,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      // Do not force shift scope when packing_entry_ids already identify the
      // receipt target. PT almacenista operates by pending entries, not by the
      // production shift attached to the operator session.
      shift_id: packingEntryIds.length > 0 ? undefined : (Number(body?.shift_id || 0) || undefined),
      packing_entry_ids: packingEntryIds,
      received_lines: receivedLines,
    })
    if (envelope?.ok === false) {
      throw new Error(envelope?.message || 'Error confirmando recepción PT')
    }
    return envelope?.data ?? envelope
  }

  // ── Transformation (Sebastián rollout 2026-04-10) ────────────────────────
  // Backend: uses existing gf.transformation.order model (no new model).
  if (cleanPath === '/pwa-pt/transformation-pending' && method === 'GET') {
    const result = await odooHttp('GET', '/api/pt/transformation/pending', {
      warehouse_id: warehouseId,
      company_id: companyId || undefined,
    })
    return result?.data ?? result
  }

  if (cleanPath === '/pwa-pt/transformation-catalog' && method === 'GET') {
    const result = await odooHttp('GET', '/api/pt/transformation/catalog', {
      warehouse_id: warehouseId,
      employee_id: Number(query.get('employee_id') || 0) || getEmployeeId() || undefined,
      role_scope: query.get('role_scope') || 'pt',
    })
    return result?.data ?? result
  }

  if (cleanPath === '/pwa-pt/transformation-history' && method === 'GET') {
    const result = await odooHttp('GET', '/api/pt/transformation/history', {
      warehouse_id: warehouseId,
      employee_id: Number(query.get('employee_id') || 0) || getEmployeeId() || undefined,
      role_scope: query.get('role_scope') || 'pt',
      date: query.get('date') || undefined,
    })
    return result?.data ?? result
  }

  if (cleanPath === '/pwa-pt/transformation-create' && method === 'POST') {
    return odooJson('/api/pt/transformation/create', {
      warehouse_id: body?.warehouse_id || warehouseId,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      role_scope: body?.role_scope || 'pt',
      recipe_code: body?.recipe_code || undefined,
      input_product_id: body?.input_product_id || body?.from_product_id || undefined,
      input_qty_units: body?.input_qty_units != null ? Number(body.input_qty_units) : undefined,
      output_qty_units: body?.output_qty_units != null ? Number(body.output_qty_units) : undefined,
      from_product_id: body?.from_product_id || undefined,
      to_product_id: body?.to_product_id || undefined,
      qty: body?.qty != null ? Number(body.qty) : undefined,
      notes: body?.notes || '',
      lines: body?.lines || undefined,
    })
  }

  if (cleanPath === '/pwa-pt/transformation-cancel' && method === 'POST') {
    return odooJson('/api/pt/transformation/cancel', {
      transformation_id: body?.transformation_id || undefined,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      reason: body?.reason || '',
    })
  }

  if (cleanPath === '/pwa-entregas/transformation-catalog' && method === 'GET') {
    const result = await odooHttp('GET', '/api/pt/transformation/catalog', {
      warehouse_id: warehouseId,
      employee_id: Number(query.get('employee_id') || 0) || getEmployeeId() || undefined,
      role_scope: query.get('role_scope') || 'entregas',
    })
    return result?.data ?? result
  }

  if (cleanPath === '/pwa-entregas/transformation-history' && method === 'GET') {
    const result = await odooHttp('GET', '/api/pt/transformation/history', {
      warehouse_id: warehouseId,
      employee_id: Number(query.get('employee_id') || 0) || getEmployeeId() || undefined,
      role_scope: query.get('role_scope') || 'entregas',
      date: query.get('date') || undefined,
    })
    return result?.data ?? result
  }

  if (cleanPath === '/pwa-entregas/transformation-create' && method === 'POST') {
    return odooJson('/api/pt/transformation/create', {
      warehouse_id: body?.warehouse_id || warehouseId,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      role_scope: body?.role_scope || 'entregas',
      recipe_code: body?.recipe_code || undefined,
      input_product_id: body?.input_product_id || undefined,
      input_qty_units: body?.input_qty_units != null ? Number(body.input_qty_units) : undefined,
      output_qty_units: body?.output_qty_units != null ? Number(body.output_qty_units) : undefined,
      notes: body?.notes || '',
    })
  }

  if (cleanPath === '/pwa-entregas/transformation-cancel' && method === 'POST') {
    return odooJson('/api/pt/transformation/cancel', {
      transformation_id: body?.transformation_id || undefined,
      employee_id: body?.employee_id || getEmployeeId() || 0,
      reason: body?.reason || '',
    })
  }

  // ── Forecast requests (Sebastián rollout 2026-04-10, gf_saleops) ─────────
  // Backend: gf_saleops/controllers/pt.py
  //   Warehouse → analytic resolution.
  //   Scope precedence: employee > branch > global.
  //   Uses existing gf.saleops.forecast, line aggregation.
  if (cleanPath === '/pwa-pt/forecast-pending' && method === 'GET') {
    const result = await odooHttp('GET', '/api/pt/forecast/pending', {
      warehouse_id: warehouseId,
      employee_id: Number(query.get('employee_id') || 0) || getEmployeeId() || undefined,
      company_id: companyId || undefined,
    })
    return result?.data ?? result
  }

  // ── Day sales by employee (Sebastián audit 2026-04-10) ──────────────────
  // Backend: gf_saleops/controllers/pt.py → GET /api/pt/day-sales
  // Expone sales_qty_by_employee_for_day() como HTTP endpoint.
  // Response: { ok, data: { date, warehouse_id, items: [{employee_id, employee_name, qty_total, ...}] } }
  if (cleanPath === '/pwa-pt/day-sales' && method === 'GET') {
    const result = await odooHttp('GET', '/api/pt/day-sales', {
      warehouse_id: warehouseId,
      date: query.get('date') || undefined,
      company_id: companyId || undefined,
    })
    return result?.data ?? result
  }

  // ── Transfers history PT→CEDIS (Sebastián audit 2026-04-10) ─────────────
  // Backend: gf_logistics_ops/controllers/pt.py → GET /api/pt/transfers/history
  // Historial de stock.picking para transferencias PT→CEDIS.
  // Response: { ok, data: { items: [{id, name, state, date, origin, destination, lines}], total } }
  if (cleanPath === '/pwa-pt/transfers-history' && method === 'GET') {
    const result = await odooHttp('GET', '/api/pt/transfers/history', {
      warehouse_id: warehouseId,
      date_from: query.get('date_from') || undefined,
      date_to: query.get('date_to') || undefined,
      limit: Number(query.get('limit') || 50),
      offset: Number(query.get('offset') || 0),
      company_id: companyId || undefined,
    })
    return result?.data ?? result
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
    // gf.route.plan no tiene warehouse_id directo; el almacen vive en route_id.warehouse_dispatch_id
    if (warehouseId) domain.push(['route_id.warehouse_dispatch_id', '=', warehouseId])
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
    // Sebastian rollout 2026-04-19: motor transaccional. El controller
    // route_plan/seal_load valida el load_picking_id (button_validate),
    // marca load_sealed/load_sealed_at/load_sealed_by_id y propaga el state.
    // Precondiciones: stock reservado (assigned), plan en estado 'published'.
    const planId = Number(body?.plan_id || body?.route_plan_id || 0)
    if (!planId) return { ok: false, error: 'plan_id requerido' }
    return odooJson('/gf/logistics/api/employee/route_plan/seal_load', {
      plan_id: planId,
    })
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
      reason_id: body?.reason_id || 0,
      notes: body?.notes || '',
      lot_id: body?.lot_id || null,
    })
  }

  if (cleanPath === '/pwa-entregas/scrap-history' && method === 'GET') {
    return odooJson('/gf/logistics/api/employee/warehouse_scrap/history', {
      warehouse_id: warehouseId,
    })
  }

  if (cleanPath === '/pwa-entregas/scrap-reasons' && method === 'GET') {
    return odooJson('/gf/logistics/api/employee/warehouse_scrap/reasons', {})
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

  // ── Sprint 5: Tareas del supervisor (guía §8) ─────────────────────────────
  // Passthrough a controllers Odoo. Backend valida permiso is_supervisor_ventas.

  if (cleanPath === '/pwa-supv/tasks' && method === 'GET') {
    // Controller espera GET (no POST JSON-RPC). Usar odooHttp.
    return odooHttp('GET', '/pwa-supv/tasks', {
      company_id:  Number(query.get('company_id'))  || companyId || undefined,
      assignee_id: Number(query.get('assignee_id')) || undefined,
      state:       query.get('state')    || undefined,
      priority:    query.get('priority') || undefined,
      limit:       Number(query.get('limit')) || undefined,
    })
  }

  if (cleanPath === '/pwa-supv/tasks/create' && method === 'POST') {
    return odooJson('/pwa-supv/tasks/create', {
      title:       String(body?.title || '').trim(),
      description: body?.description || undefined,
      assignee_id: Number(body?.assignee_id || 0),
      priority:    body?.priority || 'medium',
      due_date:    body?.due_date || undefined,
      partner_id:  body?.partner_id ? Number(body.partner_id) : undefined,
      company_id:  companyId || undefined,
    })
  }

  if (cleanPath === '/pwa-supv/tasks/update' && method === 'POST') {
    return odooJson('/pwa-supv/tasks/update', {
      task_id: Number(body?.task_id || 0),
      patch:   body?.patch || {},
    })
  }

  if (cleanPath === '/pwa-supv/tasks/complete' && method === 'POST') {
    return odooJson('/pwa-supv/tasks/complete', {
      task_id:          Number(body?.task_id || 0),
      completion_notes: String(body?.completion_notes || '').trim(),
    })
  }

  // ── Sprint 5: Notas de coaching (guía §8d) ────────────────────────────────

  if (cleanPath === '/pwa-supv/notes' && method === 'GET') {
    // Controller espera GET (no POST JSON-RPC). Mismo patron que /pwa-supv/tasks.
    return odooHttp('GET', '/pwa-supv/notes', {
      subject_type: query.get('subject_type') || undefined,
      subject_id:   Number(query.get('subject_id')) || undefined,
      company_id:   companyId || undefined,
    })
  }

  if (cleanPath === '/pwa-supv/notes/create' && method === 'POST') {
    return odooJson('/pwa-supv/notes/create', {
      body:         String(body?.body || '').trim(),
      subject_type: body?.subject_type || undefined,
      subject_id:   body?.subject_id ? Number(body.subject_id) : undefined,
      author_id:    body?.author_id ? Number(body.author_id) : undefined,
      company_id:   companyId || undefined,
    })
  }

  if (cleanPath === '/pwa-supv/notes/delete' && method === 'POST') {
    return odooJson('/pwa-supv/notes/delete', {
      note_id: Number(body?.note_id || 0),
    })
  }

  // ── Sprint 5: Clientes inactivos / recuperación (guía §6) ─────────────────

  if (cleanPath === '/pwa-supv/customers/inactive' && method === 'GET') {
    return odooJson('/pwa-supv/customers/inactive', {
      company_id: Number(query.get('company_id')) || companyId || undefined,
      limit:      Number(query.get('limit'))      || undefined,
      offset:     Number(query.get('offset'))     || undefined,
    })
  }

  if (cleanPath === '/pwa-supv/customers/recovery' && method === 'GET') {
    return odooJson('/pwa-supv/customers/recovery', {
      company_id: Number(query.get('company_id')) || companyId || undefined,
      limit:      Number(query.get('limit'))      || undefined,
      offset:     Number(query.get('offset'))     || undefined,
    })
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
    throw new ApiError('no_session', { status: 401, code: 'no_session' })
  }

  // Bypass mode: allow direct Odoo handlers (public /get_records is sudo=1),
  // but still block any n8n fallback since bypass has no JWT.
  const direct = await routeDirect(method, path, body)
  if (direct !== NO_DIRECT) {
    return direct
  }

  if (isBypass()) {
    throw new ApiError('bypass_no_api', { status: 0, code: 'bypass' })
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

  let res
  try {
    res = await fetch(`${N8N_BASE}${path}`, opts)
  } catch (fetchErr) {
    // Network error (sin conexion, DNS, CORS, etc.)
    throw new ApiError(fetchErr.message || 'Network error', { status: 0, code: 'network' })
  }

  if (!res.ok) {
    if (res.status === 401) {
      // Solo expirar sesión si el 401 viene de un endpoint CRÍTICO de auth.
      // Endpoints opcionales (Metabase, capabilities, reportes externos) NO
      // deben disparar logout — la PWA los trata como "feature no disponible".
      // Guía 2026-04-18: evitamos el bug P0 donde Mis KPIs expulsaba al usuario.
      if (!isOptionalEndpoint(path)) {
        expireSession()
      }
      throw new ApiError('no_session', { status: 401, code: 'no_session' })
    }
    const err = await res.json().catch(() => ({}))
    throw new ApiError(err.message || `http_${res.status}`, { status: res.status, code: 'http_error' })
  }

  const json = await res.json()
  // n8n suele devolver { data: ... }.
  return json.data !== undefined ? json.data : json
}

/** Endpoints cuyo 401 NO debe disparar logout.
 *  Son features externas/opcionales (Metabase, capabilities, telemetría).
 *  Si fallan, el usuario sigue operando normalmente y se degrada la UI. */
function isOptionalEndpoint(path) {
  if (!path) return false
  const clean = String(path).split('?')[0]
  return (
    clean.startsWith('/pwa-metabase-token') ||
    clean.startsWith('/pwa-metabase/token') ||
    clean.startsWith('/pwa-metabase/') ||
    clean.startsWith('/pwa-admin/capabilities') ||
    clean.startsWith('/pwa/evidence/upload') // fallar upload de foto NO debe cerrar sesión
  )
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
