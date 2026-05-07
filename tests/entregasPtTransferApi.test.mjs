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
    employee_id: 730,
    warehouse_id: 89,
    company_id: 34,
    gf_salesops_token: 'salesops-token',
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

test('pwa pt accept-transfer sends negative pending ids to gf_salesops receive_pt accept', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return createJsonResponse(200, {
      result: {
        status: 'ok',
        code: 'OK',
        user_message: 'El pendiente PT sigue procesandose',
        data: {
          transfer_id: 38,
          transfer_ref: 'PTT/00038',
          transfer_state: 'processing',
          retry_after: 5,
        },
      },
    })
  }

  const result = await api('POST', '/pwa-pt/accept-transfer', { picking_id: -38 })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/odoo-api/gf/salesops/warehouse/receive_pt/accept')
  const payload = JSON.parse(calls[0].options.body)
  assert.equal(payload.params.meta.employee_id, 730)
  assert.equal(payload.params.meta.warehouse_id, 89)
  assert.equal(payload.params.data.picking_id, -38)
  assert.match(String(payload.params.meta.request_id || ''), /^pwa-pt-accept-transfer-/)
  assert.equal(payload.params.meta.idempotency_key, payload.params.meta.request_id)
  assert.equal(calls[0].options.headers['X-GF-Token'], 'salesops-token')
  assert.deepEqual(result, {
    ok: true,
    message: 'El pendiente PT sigue procesandose',
    code: 'OK',
    data: {
      transfer_id: 38,
      transfer_ref: 'PTT/00038',
      transfer_state: 'processing',
      retry_after: 5,
    },
    meta: {},
  })
})

test('pwa pt accept-transfer preserves backend validation errors from gf_salesops envelope', async () => {
  setSession()

  globalThis.fetch = async () =>
    createJsonResponse(200, {
      result: {
        status: 'error',
        code: 'VALIDATION_ERROR',
        user_message: 'No hay stock suficiente en Planta para validar',
        data: {
          transfer_id: 38,
          transfer_ref: 'PTT/00038',
          transfer_state: 'error',
          error_message: 'No hay stock suficiente en Planta para validar',
        },
      },
    })

  const result = await api('POST', '/pwa-pt/accept-transfer', { picking_id: -38 })

  assert.deepEqual(result, {
    ok: false,
    error: 'No hay stock suficiente en Planta para validar',
    message: 'No hay stock suficiente en Planta para validar',
    code: 'VALIDATION_ERROR',
    data: {
      transfer_id: 38,
      transfer_ref: 'PTT/00038',
      transfer_state: 'error',
      error_message: 'No hay stock suficiente en Planta para validar',
    },
    meta: {},
  })
})
