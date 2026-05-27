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
    employee_id: 717,
    company_id: 34,
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

test('admin liquidaciones pending uses the HTTP GET controller instead of JSON-RPC POST', async () => {
  setSession()
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return createJsonResponse(200, { ok: true, data: { plans: [] } })
  }

  await api('GET', '/pwa-admin/liquidaciones/pending?company_id=34&warehouse_id=76')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/odoo-api/pwa-admin/liquidaciones/pending?company_id=34&warehouse_id=76')
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(Object.hasOwn(calls[0].options, 'body'), false)
})

test('admin liquidaciones detail and history use HTTP GET controllers', async () => {
  setSession()
  const calls = []

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return createJsonResponse(200, { ok: true, data: {} })
  }

  await api('GET', '/pwa-admin/liquidaciones/detail?plan_id=44')
  await api('GET', '/pwa-admin/liquidaciones/history?company_id=34&warehouse_id=76&date_from=2026-05-01&date_to=2026-05-27')

  assert.deepEqual(
    calls.map((call) => [call.options.method, call.url, Object.hasOwn(call.options, 'body')]),
    [
      ['GET', '/odoo-api/pwa-admin/liquidaciones/detail?plan_id=44', false],
      ['GET', '/odoo-api/pwa-admin/liquidaciones/history?company_id=34&warehouse_id=76&date_from=2026-05-01&date_to=2026-05-27&limit=50&offset=0', false],
    ],
  )
})
