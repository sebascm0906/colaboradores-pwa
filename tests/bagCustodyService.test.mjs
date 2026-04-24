import test from 'node:test'
import assert from 'node:assert/strict'

import {
  declareBagCustody,
  getPendingBagCustody,
  issueBagCustody,
  normalizeBagCustodyRecord,
  computeBagDifference,
  validateBagCustody,
} from '../src/modules/almacen-pt/bagCustodyService.js'
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
    employee_id: 31,
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

test('computeBagDifference creates debt only for positive shortages', () => {
  const summary = computeBagDifference({
    bagsIssued: 10,
    bagsValidatedByManager: 7,
    bagUnitCost: 4,
  })

  assert.equal(summary.differenceBags, 3)
  assert.equal(summary.differenceAmount, 12)
  assert.equal(summary.debtRequired, true)
})

test('computeBagDifference clamps zero and negative shortages without debt', () => {
  const zeroShortage = computeBagDifference({
    bagsIssued: 10,
    bagsValidatedByManager: 10,
    bagUnitCost: 4,
  })

  const negativeShortage = computeBagDifference({
    bagsIssued: 7,
    bagsValidatedByManager: 9,
    bagUnitCost: 4,
  })

  assert.equal(zeroShortage.differenceBags, 0)
  assert.equal(zeroShortage.differenceAmount, 0)
  assert.equal(zeroShortage.debtRequired, false)
  assert.equal(negativeShortage.differenceBags, 0)
  assert.equal(negativeShortage.differenceAmount, 0)
  assert.equal(negativeShortage.debtRequired, false)
})

test('normalizeBagCustodyRecord preserves contract fields needed by the UI', () => {
  const record = normalizeBagCustodyRecord({
    id: '15',
    shift_id: '101',
    destination_role: 'operador_rolito',
    state: 'declared_by_worker',
    bags_issued: '8',
    bags_declared_by_worker: '7',
    bags_validated_by_manager: '6',
    difference_bags: '2',
    difference_amount: '7.5',
    debt_created: true,
    worker_notes: 'Sobran mojadas',
    manager_notes: 'Conteo final',
    issued_at: '2026-04-24T08:00:00Z',
    declared_at: '2026-04-24T15:00:00Z',
    validated_at: '2026-04-24T16:00:00Z',
  })

  assert.equal(record.id, 15)
  assert.equal(record.shift_id, 101)
  assert.equal(record.destination_role, 'operador_rolito')
  assert.equal(record.state, 'declared_by_worker')
  assert.equal(record.bags_issued, 8)
  assert.equal(record.bags_declared_by_worker, 7)
  assert.equal(record.bags_validated_by_manager, 6)
  assert.equal(record.difference_bags, 2)
  assert.equal(record.difference_amount, 7.5)
  assert.equal(record.debt_created, true)
  assert.equal(record.worker_notes, 'Sobran mojadas')
  assert.equal(record.manager_notes, 'Conteo final')
  assert.equal(record.issued_at, '2026-04-24T08:00:00Z')
  assert.equal(record.declared_at, '2026-04-24T15:00:00Z')
  assert.equal(record.validated_at, '2026-04-24T16:00:00Z')
})

test('getPendingBagCustody normalizes pending records from backend', async () => {
  setSession()

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return createJsonResponse(200, {
      items: [
        {
          id: '15',
          shift_id: '101',
          destination_role: 'operador_rolito',
          state: 'declared_by_worker',
          bags_issued: '8',
          difference_bags: '2',
          difference_amount: '7.5',
          debt_created: true,
          worker_notes: 'Sobran mojadas',
        },
      ],
    })
  }

  const pending = await getPendingBagCustody({
    warehouseId: 9,
    employeeId: 31,
    role: 'operador_rolito',
  })

  assert.equal(calls.length, 1)
  assert.equal(
    calls[0].url,
    '/odoo-api/api/production/bags/custody/pending?warehouse_id=9&employee_id=31&role=operador_rolito'
  )
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(pending.items[0].id, 15)
  assert.equal(pending.items[0].shift_id, 101)
  assert.equal(pending.items[0].destination_role, 'operador_rolito')
  assert.equal(pending.items[0].bags_issued, 8)
  assert.equal(pending.items[0].difference_bags, 2)
  assert.equal(pending.items[0].difference_amount, 7.5)
  assert.equal(pending.items[0].debt_created, true)
  assert.equal(pending.items[0].worker_notes, 'Sobran mojadas')
})

test('issueBagCustody posts the custody payload and normalizes the response', async () => {
  setSession({ employee_id: 44 })

  const calls = []
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    return createJsonResponse(200, {
      id: '28',
      shift_id: '101',
      destination_role: 'almacenista_pt',
      state: 'issued',
      bags_issued: '30',
      bag_unit_cost: '3.5',
      issued_at: '2026-04-24T08:00:00Z',
      manager_notes: 'Entrega inicial',
    })
  }

  const record = await issueBagCustody({
    warehouseId: 9,
    destinationKey: 'pt',
    workerEmployeeId: 77,
    bagsIssued: 30,
    bagUnitCost: 3.5,
    issuedBy: 44,
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/odoo-api/api/production/bags/custody/issue')
  assert.equal(calls[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    warehouse_id: 9,
    destination_key: 'pt',
    worker_employee_id: 77,
    bags_issued: 30,
    bag_unit_cost: 3.5,
    issued_by: 44,
  })
  assert.equal(record.id, 28)
  assert.equal(record.shift_id, 101)
  assert.equal(record.destination_role, 'almacenista_pt')
  assert.equal(record.state, 'issued')
  assert.equal(record.bags_issued, 30)
  assert.equal(record.issued_at, '2026-04-24T08:00:00Z')
  assert.equal(record.manager_notes, 'Entrega inicial')
})

test('declareBagCustody and validateBagCustody preserve semantic backend errors', async () => {
  setSession()

  let callCount = 0
  globalThis.fetch = async () => {
    callCount += 1
    if (callCount === 1) {
      return createJsonResponse(409, {
        code: 'BAG_CUSTODY_NOT_FOUND',
        message: 'No existe custodia pendiente',
      })
    }
    return createJsonResponse(409, {
      code: 'BAG_CUSTODY_ALREADY_VALIDATED',
      message: 'La custodia ya fue validada',
    })
  }

  await assert.rejects(
    () => declareBagCustody({ custodyId: 91, bagsDeclaredByWorker: 7 }),
    (error) => {
      assert.equal(error instanceof ApiError, true)
      assert.equal(error.status, 409)
      assert.equal(error.code, 'BAG_CUSTODY_NOT_FOUND')
      assert.equal(error.message, 'No existe custodia pendiente')
      return true
    }
  )

  await assert.rejects(
    () => validateBagCustody({ custodyId: 91, bagsValidatedByManager: 6 }),
    (error) => {
      assert.equal(error instanceof ApiError, true)
      assert.equal(error.status, 409)
      assert.equal(error.code, 'BAG_CUSTODY_ALREADY_VALIDATED')
      assert.equal(error.message, 'La custodia ya fue validada')
      return true
    }
  )
})
