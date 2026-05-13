import test from 'node:test'
import assert from 'node:assert/strict'

import { ApiError, api } from '../src/lib/api.js'

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
    employee_id: 730,
    company_id: 35,
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

test('packing-create treats packing_entry_id as success even when backend ok flag is false', async () => {
  setSession()

  globalThis.fetch = async (url) => {
    assert.equal(url, '/odoo-api/api/production/pack')
    return createJsonResponse(200, {
      ok: false,
      message: 'No se pudo guardar el empaque en Odoo',
      data: {
        packing_entry_id: 456,
        qty_bags: 12,
        total_kg: 66,
      },
    })
  }

  const result = await api('POST', '/pwa-prod/packing-create', {
    shift_id: 88,
    cycle_id: 19,
    product_id: 321,
    qty_bags: 12,
  })

  assert.equal(result.id, 456)
  assert.equal(result.packing_entry_id, 456)
  assert.equal(result.qty_bags, 12)

  const localStore = JSON.parse(globalThis.localStorage.getItem('gfsc.packing_local.v2') || '{}')
  assert.equal(localStore['88'].entries.length, 1)
  assert.equal(localStore['88'].entries[0].id, 456)
})

test('packing-create still throws when backend returns no entry id', async () => {
  setSession()

  globalThis.fetch = async () => createJsonResponse(200, {
    ok: false,
    message: 'No se pudo guardar el empaque en Odoo',
    data: {},
  })

  await assert.rejects(
    api('POST', '/pwa-prod/packing-create', {
      shift_id: 88,
      cycle_id: 19,
      product_id: 321,
      qty_bags: 12,
    }),
    (error) => {
      assert.equal(error instanceof ApiError, true)
      assert.equal(error.message, 'No se pudo guardar el empaque en Odoo')
      assert.equal(error.code, 'packing_save_failed')
      return true
    },
  )
})

test('packing-create unwraps jsonrpc result envelope from Odoo pack endpoint', async () => {
  setSession()

  globalThis.fetch = async () => createJsonResponse(200, {
    jsonrpc: '2.0',
    id: null,
    result: {
      ok: true,
      message: 'Empaque registrado. Pendiente de recepcion PT.',
      data: {
        packing_entry_id: 495,
        cycle_id: 191,
        qty_reported: 1,
        qty_bags: 1,
        total_kg: 5.5,
        posted: false,
        material_posted: true,
        material_posting_id: 1755,
      },
    },
  })

  const result = await api('POST', '/pwa-prod/packing-create', {
    shift_id: 103,
    cycle_id: 191,
    product_id: 761,
    qty_bags: 1,
    production_order_id: 0,
  })

  assert.equal(result.id, 495)
  assert.equal(result.packing_entry_id, 495)
  assert.equal(result.cycle_id, 191)
  assert.equal(result.qty_bags, 1)
  assert.equal(result.total_kg, 5.5)

  const localStore = JSON.parse(globalThis.localStorage.getItem('gfsc.packing_local.v2') || '{}')
  assert.equal(localStore['103'].entries.length, 1)
  assert.equal(localStore['103'].entries[0].id, 495)
})
