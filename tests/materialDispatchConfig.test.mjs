import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeDispatchConfig,
  getEnabledDispatchDestinations,
} from '../src/modules/almacen-pt/materialDispatchConfig.js'
import {
  createDispatchTransfer,
  getDispatchConfig,
} from '../src/modules/almacen-pt/materialsService.js'
import { ApiError } from '../src/lib/api.js'

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

test('normalizeDispatchConfig keeps only rolito and pt destinations', () => {
  const config = normalizeDispatchConfig({
    material_dispatch: {
      destinations: [
        { key: 'rolito', location_id: 1, location_name: 'ROLITO' },
        { key: 'pt', location_id: 2, location_name: 'PT' },
        { key: 'otro', location_id: 3, location_name: 'OTRO' },
      ],
    },
    bags_policy: { unit_cost: 3.5, auto_create_employee_debt: true },
  })

  assert.deepEqual(
    getEnabledDispatchDestinations(config).map((item) => item.key),
    ['rolito', 'pt']
  )
})

test('normalizeDispatchConfig preserves bags policy fields', () => {
  const config = normalizeDispatchConfig({
    bags_policy: {
      unit_cost: 3.5,
      auto_create_employee_debt: true,
    },
  })

  assert.equal(config.bags_policy.unit_cost, 3.5)
  assert.equal(config.bags_policy.auto_create_employee_debt, true)
})

test('getDispatchConfig normalizes backend dispatch config payload', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return createJsonResponse(200, {
      warehouse_id: 9,
      warehouse_name: 'PIGU/MP-IGUALA',
      material_dispatch: {
        destinations: [
          { key: 'rolito', location_id: 1, location_name: 'ROLITO' },
          { key: 'pt', location_id: 2, location_name: 'PT' },
          { key: 'otro', location_id: 3, location_name: 'OTRO' },
        ],
      },
      bags_policy: {
        unit_cost: 2.75,
        auto_create_employee_debt: true,
      },
    })
  }

  const config = await getDispatchConfig({ warehouseId: 9 })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/odoo-api/api/production/materials/dispatch-config?warehouse_id=9')
  assert.equal(calls[0].options.method, 'GET')
  assert.deepEqual(
    getEnabledDispatchDestinations(config).map((item) => item.key),
    ['rolito', 'pt']
  )
  assert.equal(config.bags_policy.unit_cost, 2.75)
})

test('createDispatchTransfer preserves semantic backend errors', async () => {
  setSession({ employee_id: 41 })

  globalThis.fetch = async () =>
    createJsonResponse(409, {
      code: 'INVALID_DISPATCH_DESTINATION',
      message: 'Destino no configurado',
    })

  await assert.rejects(
    () =>
      createDispatchTransfer({
        warehouseId: 9,
        destinationKey: 'otro',
        workerEmployeeId: 77,
        materialId: 5,
        qtyIssued: 12,
        issuedBy: 41,
      }),
    (error) => {
      assert.equal(error instanceof ApiError, true)
      assert.equal(error.status, 409)
      assert.equal(error.code, 'INVALID_DISPATCH_DESTINATION')
      assert.equal(error.message, 'Destino no configurado')
      return true
    }
  )
})
