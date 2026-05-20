import test from 'node:test'
import assert from 'node:assert/strict'

import { api, ApiError } from '../src/lib/api.js'

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
    api_key: 'api-key-test',
    gf_employee_token: 'employee-token-test',
    employee_id: 699,
    role: 'gerente_sucursal',
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

test('iguala stock sends the persisted API key on refresh', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return createJsonResponse(200, {
      ok: true,
      message: 'OK',
      data: {
        location_id: 1172,
        location_name: 'PIGU/MP-IGUALA',
        products: [],
      },
    })
  }

  await api('GET', '/pwa-admin/traspaso-mp/iguala-stock')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/odoo-api/pwa-admin/traspaso-mp/iguala-stock')
  assert.equal(calls[0].options.headers['Api-Key'], 'api-key-test')
  assert.equal(calls[0].options.headers['X-GF-Employee-Token'], 'employee-token-test')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-test')
})

test('iguala stock treats backend API key rejection as an expired session', async () => {
  setSession({ api_key: 'stale-api-key' })

  const events = []
  globalThis.window = {
    dispatchEvent(event) {
      events.push(event.type)
    },
  }
  globalThis.fetch = async () => createJsonResponse(200, {
    ok: false,
    message: 'API key requerida.',
    data: {},
  })

  await assert.rejects(
    api('GET', '/pwa-admin/traspaso-mp/iguala-stock'),
    (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 401)
      assert.equal(error.code, 'no_session')
      assert.equal(error.message, 'API key requerida.')
      return true
    },
  )
  assert.deepEqual(events, ['gf:session-expired'])
})
