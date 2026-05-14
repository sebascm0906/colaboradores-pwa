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

test('expense create omits account_id when the user did not select one explicitly', async () => {
  setSession()
  const createUpdateCalls = []

  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    if (url === '/odoo-api/api/create_update') {
      createUpdateCalls.push(payload.params)
      return createJsonResponse(200, { result: { id: 901 } })
    }
    return createJsonResponse(500, { error: `Unexpected ${url}` })
  }

  await api('POST', '/pwa-admin/expense-create', {
    name: 'Gasolina',
    date: '2026-05-13',
    company_id: 34,
    payment_mode: 'company_account',
    quantity: 1,
    total_amount: 300,
    description: 'Carga de unidad',
  })

  assert.equal(createUpdateCalls.length, 1)
  assert.equal(createUpdateCalls[0].model, 'hr.expense')
  assert.equal(createUpdateCalls[0].method, 'create')
  assert.equal(Object.hasOwn(createUpdateCalls[0].dict, 'account_id'), false)
})

test('expense create omits invalid account_id values instead of falling back to a hardcoded account', async () => {
  setSession()
  const createUpdateCalls = []

  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    if (url === '/odoo-api/api/create_update') {
      createUpdateCalls.push(payload.params)
      return createJsonResponse(200, { result: { id: 902 } })
    }
    return createJsonResponse(500, { error: `Unexpected ${url}` })
  }

  await api('POST', '/pwa-admin/expense-create', {
    name: 'Casetas',
    date: '2026-05-13',
    company_id: 34,
    payment_mode: 'company_account',
    quantity: 1,
    total_amount: 120,
    description: 'Traslado',
    account_id: 0,
  })

  assert.equal(createUpdateCalls.length, 1)
  assert.equal(Object.hasOwn(createUpdateCalls[0].dict, 'account_id'), false)
})

test('expense create omits positive legacy account_id values until an account selector exists', async () => {
  setSession()
  const createUpdateCalls = []

  globalThis.fetch = async (url, options = {}) => {
    const payload = options.body ? JSON.parse(options.body) : null
    if (url === '/odoo-api/api/create_update') {
      createUpdateCalls.push(payload.params)
      return createJsonResponse(200, { result: { id: 903 } })
    }
    return createJsonResponse(500, { error: `Unexpected ${url}` })
  }

  await api('POST', '/pwa-admin/expense-create', {
    name: 'Refacciones',
    date: '2026-05-13',
    company_id: 34,
    payment_mode: 'company_account',
    quantity: 1,
    total_amount: 500,
    description: 'Compra autorizada',
    account_id: 445,
  })

  assert.equal(createUpdateCalls.length, 1)
  assert.equal(Object.hasOwn(createUpdateCalls[0].dict, 'account_id'), false)
})
