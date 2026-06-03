import test from 'node:test'
import assert from 'node:assert/strict'

import { api } from '../src/lib/api.js'

const originalLocalStorage = globalThis.localStorage
const originalFetch = globalThis.fetch
const originalWindow = globalThis.window

function createLocalStorageMock() {
  let store = {}
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key, value) {
      store[key] = String(value)
    },
    removeItem(key) {
      delete store[key]
    },
    clear() {
      store = {}
    },
  }
}

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload)
    },
  }
}

function setSession(session = {}) {
  globalThis.localStorage.setItem('gf_session', JSON.stringify({
    session_token: 'token-test',
    odoo_api_key: 'api-key-test',
    employee_id: 717,
    company_id: 34,
    warehouse_id: 89,
    x_analytic_account_id: [901, 'CEDIS Iguala'],
    ...session,
  }))
}

test.beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock()
  globalThis.window = { dispatchEvent() {} }
})

test.afterEach(() => {
  globalThis.localStorage = originalLocalStorage
  globalThis.fetch = originalFetch
  globalThis.window = originalWindow
})

test('supervisor route templates does not introspect ir.model.fields metadata', async () => {
  setSession()
  const models = []

  globalThis.fetch = async (url, options = {}) => {
    assert.equal(url, '/odoo-api/get_records_sorted')
    const payload = JSON.parse(options.body)
    const params = payload.params || {}
    models.push(params.model)

    if (params.model === 'ir.model.fields') {
      throw new Error('route templates must not query ir.model.fields')
    }

    if (params.model === 'hr.employee') {
      return createJsonResponse(200, {
        result: {
          response: [
            { id: 717, name: 'Supervisora', user_id: [17, 'supervisora'], x_analytic_account_id: [901, 'CEDIS Iguala'] },
            { id: 21, name: 'Ruta 21', user_id: [21, 'ruta21'], x_analytic_account_id: [901, 'CEDIS Iguala'] },
          ],
        },
      })
    }

    if (params.model === 'gf.route') {
      return createJsonResponse(200, {
        result: {
          response: [
            {
              id: 700,
              name: 'Ruta Centro',
              warehouse_dispatch_id: [89, 'CEDIS Iguala'],
              company_id: [34, 'GLACIEM'],
              active: true,
              driver_employee_id: [21, 'Ruta 21'],
              salesperson_employee_id: false,
              assistant_employee_id: false,
            },
          ],
        },
      })
    }

    if (params.model === 'gf.route.plan') {
      return createJsonResponse(200, {
        result: {
          response: [
            {
              id: 800,
              name: 'PLAN/800',
              date: '2026-06-03',
              route_id: [700, 'Ruta Centro'],
              state: 'draft',
              driver_employee_id: [21, 'Ruta 21'],
              salesperson_employee_id: false,
              stops_total: 0,
              stops_done: 0,
              load_picking_id: false,
              load_sealed: false,
            },
          ],
        },
      })
    }

    if (params.model === 'gf.saleops.forecast') {
      return createJsonResponse(200, {
        result: {
          response: [
            { id: 900, state: 'draft', date_target: '2026-06-03', route_plan_id: [800, 'PLAN/800'] },
          ],
        },
      })
    }

    return createJsonResponse(200, { result: { response: [] } })
  }

  const rows = await api('GET', '/pwa-supv/route-templates?date_target=2026-06-03')

  assert.equal(rows.length, 1)
  assert.equal(rows[0].route_id, 700)
  assert.equal(rows[0].forecast_id, 900)
  assert.equal(models.includes('ir.model.fields'), false)
})

test('supervisor route plan preview uses ensure endpoint and reads generated stops', async () => {
  setSession()
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const payload = JSON.parse(options.body)
    const params = payload.params || {}
    calls.push({ url, params })

    if (url === '/odoo-api/gf/salesops/supervisor/v2/route_plan/preview_customers') {
      throw new Error('preview_customers endpoint is not installed')
    }

    if (url === '/odoo-api/gf/salesops/supervisor/v2/route_plan/ensure') {
      return createJsonResponse(200, {
        result: {
          ok: true,
          data: {
            plan_id: 800,
            plan_name: 'PLAN/800',
            state: 'draft',
            stops_total: 1,
          },
        },
      })
    }

    if (url === '/odoo-api/get_records_sorted' && params.model === 'gf.route.stop') {
      return createJsonResponse(200, {
        result: {
          response: [
            {
              id: 501,
              route_plan_id: [800, 'PLAN/800'],
              customer_id: [301, 'Abarrotes Sol'],
              route_sequence: 1,
              state: 'draft',
            },
          ],
        },
      })
    }

    return createJsonResponse(200, { result: { response: [] } })
  }

  const response = await api('POST', '/pwa-supv/route-plan-preview-customers', {
    route_id: 16,
    date_target: '2026-06-03',
    polygon_id: 69,
    subpolygon_ids: [],
    channel_ids: [],
    visit_days: [],
    time_window_id: null,
    demand_classes: [],
  })

  assert.equal(response.data.route_plan_id, 800)
  assert.equal(response.data.customers.length, 1)
  assert.equal(response.data.customers[0].customer_id[0], 301)
  assert.equal(calls.some((call) => call.url.endsWith('/preview_customers')), false)
  assert.equal(calls.find((call) => call.url.endsWith('/route_plan/ensure')).params.meta.tz, 'America/Mexico_City')
})

test('supervisor branch configs forbidden response degrades without throwing', async () => {
  setSession()

  globalThis.fetch = async (url) => {
    assert.equal(url, '/odoo-api/pwa-supv/branch-configs')
    return createJsonResponse(403, {
      ok: false,
      message: 'Usuario sin permisos para esta operacion.',
      data: { code: 'forbidden' },
    })
  }

  const response = await api('GET', '/pwa-supv/branch-configs')

  assert.equal(response.ok, false)
  assert.equal(response.data.code, 'forbidden')
  assert.deepEqual(response.data.branch_configs, [])
})
