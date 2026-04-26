import test from 'node:test'
import assert from 'node:assert/strict'

import { api } from '../src/lib/api.js'
import { getEligibleReceivers, getEntregasShiftStatus } from '../src/modules/entregas/entregasService.js'

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

test('direct entregas eligible-receivers keeps warehouse match even for cross-company employees', async () => {
  setSession({ company_id: 35, warehouse_id: 89 })

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return createJsonResponse(200, {
      result: [
        { id: 730, name: 'Hector', barcode: 'HEX1', job_id: [1, 'Almacenista Entregas'], warehouse_id: [89, 'CEDIS Iguala'] },
        { id: 731, name: 'TURNO 2 EN', barcode: 'TEN2', job_id: [1, 'Almacenista Entregas'], warehouse_id: [89, 'CEDIS Iguala'] },
      ],
    })
  }

  const receivers = await api('GET', '/pwa-entregas/eligible-receivers?warehouse_id=89&exclude_employee_id=730')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/odoo-api/web/dataset/call_kw/hr.employee/search_read')
  const payload = JSON.parse(calls[0].options.body)
  const domain = payload?.params?.args?.[0] || []
  assert.deepEqual(domain.slice(0, 3), [
    ['active', '=', true],
    ['job_id.name', 'ilike', 'Almacenista'],
    ['job_id.name', 'ilike', 'entregas'],
  ])
  assert.ok(domain.some((item) => Array.isArray(item) && item[0] === 'warehouse_id' && item[2] === 89))
  assert.ok(domain.some((item) => Array.isArray(item) && item[0] === 'company_id' && item[2] === 35))
  assert.deepEqual(receivers, [
    { id: 730, name: 'Hector', barcode: 'HEX1', job: 'Almacenista Entregas', warehouse_id: 89 },
    { id: 731, name: 'TURNO 2 EN', barcode: 'TEN2', job: 'Almacenista Entregas', warehouse_id: 89 },
  ])
})

test('getEntregasShiftStatus normalizes the backend ownership contract', async () => {
  setSession({ employee_id: 730, warehouse_id: 89 })

  globalThis.fetch = async () =>
    createJsonResponse(200, {
      result: {
        ok: true,
        message: 'OK',
        data: {
          blocked: true,
          pending_for_me: true,
          owner_employee_id: 730,
          owner_employee_name: 'Hector',
          handover_id: 55,
          handover: { id: 55, state: 'submitted' },
          view: 'receive_turn',
        },
      },
    })

  const status = await getEntregasShiftStatus({ warehouseId: 89, employeeId: 730 })

  assert.deepEqual(status, {
    view: 'receive_turn',
    blocked: true,
    pending_for_me: true,
    owner_employee_id: 730,
    owner_employee_name: 'Hector',
    handover_id: 55,
    handover: { id: 55, state: 'submitted' },
    raw: {
      blocked: true,
      pending_for_me: true,
      owner_employee_id: 730,
      owner_employee_name: 'Hector',
      handover_id: 55,
      handover: { id: 55, state: 'submitted' },
      view: 'receive_turn',
    },
  })
})

test('getEligibleReceivers returns the direct API list for entregas', async () => {
  setSession({ employee_id: 730, warehouse_id: 89, company_id: 35 })

  globalThis.fetch = async () =>
    createJsonResponse(200, {
      result: [
        { id: 731, name: 'TURNO 2 EN', barcode: 'TEN2', job_id: [1, 'Almacenista Entregas'], warehouse_id: [89, 'CEDIS Iguala'] },
      ],
    })

  const receivers = await getEligibleReceivers(89, 730)

  assert.deepEqual(receivers, [
    { id: 731, name: 'TURNO 2 EN', barcode: 'TEN2', job: 'Almacenista Entregas', warehouse_id: 89 },
  ])
})
