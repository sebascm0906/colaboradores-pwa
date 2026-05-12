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
    async json() {
      return payload
    },
  }
}

function setSession(session = {}) {
  globalThis.localStorage.setItem('gf_session', JSON.stringify({
    session_token: 'token-test',
    employee_id: 577,
    warehouse_id: 76,
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

test('supervision shift create reuses the existing unique shift instead of creating a duplicate', async () => {
  setSession()
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    calls.push({ url, payload })

    if (url === '/odoo-api/get_records_sorted') {
      assert.deepEqual(payload.params.domain, [
        ['plant_warehouse_id', '=', 76],
        ['date', '=', '2026-05-12'],
        ['shift_code', '=', '1'],
      ])
      return createJsonResponse(200, {
        result: {
          response: [{
            id: 80,
            name: 'Iguala Dia 2026-05-12',
            date: '2026-05-12',
            shift_code: '1',
            state: 'draft',
            plant_warehouse_id: [76, 'Planta Iguala'],
          }],
        },
      })
    }

    if (url === '/odoo-api/api/create_update') {
      return createJsonResponse(200, {
        result: {
          error: 'duplicate key value violates unique constraint "gf_production_shift_gf_production_shift_unique"',
          case: -3,
        },
      })
    }

    return createJsonResponse(500, { error: `Unexpected ${url}` })
  }

  const result = await api('POST', '/pwa-sup/shift-create', {
    date: '2026-05-12',
    shift_code: 1,
    warehouse_id: 76,
  })

  assert.equal(result.success, true)
  assert.equal(result.already_existed, true)
  assert.equal(result.shift.id, 80)
  assert.equal(result.shift.state, 'draft')
  assert.equal(result.shift.date, '2026-05-12')
  assert.equal(result.shift.shift_code, '1')
  assert.equal(calls.some((call) => call.url === '/odoo-api/api/create_update'), false)
})

test('supervision active shift fallback returns the fallback draft metadata', async () => {
  setSession()

  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null

    if (url === '/odoo-api/api/production/shift/current') {
      return createJsonResponse(200, { ok: false, data: {} })
    }

    if (url === '/odoo-api/get_records_sorted') {
      assert.equal(payload.params.model, 'gf.production.shift')
      return createJsonResponse(200, {
        result: {
          response: [{
            id: 80,
            name: 'Iguala Dia 2026-05-12',
            date: '2026-05-12',
            shift_code: '1',
            state: 'draft',
            plant_warehouse_id: [76, 'Planta Iguala'],
          }],
        },
      })
    }

    if (url === '/odoo-api/api/production/dashboard?shift_id=80') {
      return createJsonResponse(200, { ok: true, data: {} })
    }

    return createJsonResponse(500, { error: `Unexpected ${url}` })
  }

  const result = await api('GET', '/pwa-sup/active-shift?warehouse_id=76')

  assert.equal(result.id, 80)
  assert.equal(result.name, 'Iguala Dia 2026-05-12')
  assert.equal(result.state, 'draft')
  assert.equal(result.date, '2026-05-12')
  assert.equal(result.shift_code, '1')
  assert.equal(result.warehouse_id, 76)
})
