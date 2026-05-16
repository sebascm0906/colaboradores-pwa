import test from 'node:test'
import assert from 'node:assert/strict'

import {
  reportMaterial,
  resolveRejectedSettlement,
} from '../src/modules/almacen-pt/materialsService.js'

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
    key(index) {
      return Object.keys(store)[index] || null
    },
    get length() {
      return Object.keys(store).length
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
    ...session,
  }))
}

test.beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock()
  globalThis.window = {
    dispatchEvent() {},
  }
})

test.afterEach(() => {
  globalThis.localStorage = originalLocalStorage
  globalThis.fetch = originalFetch
  globalThis.window = originalWindow
})

test('reportMaterial sends only rolito damage fields for bag declaration flow', async () => {
  setSession({ employee_id: 456 })

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return createJsonResponse(200, {
      result: {
        ok: true,
        message: 'Merma registrada',
        data: {
          settlement: { settlement_id: 123, qty_damaged: 4 },
        },
      },
    })
  }

  await reportMaterial({
    settlementId: 123,
    employeeId: 456,
    qtyDamaged: 4,
    damageReason: 'broken_bag',
    damageNotes: 'Declaracion de merma rolito',
    qtyRemaining: 9,
    qtyUsed: 11,
    notes: 'Declaracion de merma rolito',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/odoo-api/api/production/materials/settlement/report')
  assert.equal(calls[0].options.method, 'POST')

  const requestBody = JSON.parse(calls[0].options.body)
  assert.equal(requestBody.settlement_id, 123)
  assert.equal(requestBody.employee_id, 456)
  assert.equal(requestBody.qty_damaged, 4)
  assert.equal(requestBody.damage_reason, 'broken_bag')
  assert.equal(requestBody.damage_notes, 'Declaracion de merma rolito')
  assert.equal('qty_remaining' in requestBody, false)
  assert.equal('qty_used' in requestBody, false)
})

test('resolveRejectedSettlement sends full bag declaration breakdown for rolito close flow', async () => {
  setSession({ employee_id: 456 })

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return createJsonResponse(200, {
      result: {
        ok: true,
        message: 'Settlement resuelto',
        data: {
          settlement: {
            settlement_id: 123,
            qty_returned: 50,
            qty_damaged: 5,
            qty_consumed: 45,
          },
        },
      },
    })
  }

  await resolveRejectedSettlement({
    settlementId: 123,
    employeeId: 456,
    qtyReturned: 50,
    qtyDamaged: 5,
    qtyConsumed: 45,
    notes: 'Declaracion de merma rolito',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/odoo-api/api/production/materials/settlement/resolve_rejected')
  assert.equal(calls[0].options.method, 'POST')

  const requestBody = JSON.parse(calls[0].options.body)
  assert.equal(requestBody.settlement_id, 123)
  assert.equal(requestBody.employee_id, 456)
  assert.equal(requestBody.qty_returned, 50)
  assert.equal(requestBody.qty_damaged, 5)
  assert.equal(requestBody.qty_consumed, 45)
  assert.equal(requestBody.notes, 'Declaracion de merma rolito')
})
