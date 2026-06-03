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
