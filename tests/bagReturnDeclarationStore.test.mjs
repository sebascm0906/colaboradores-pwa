import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBagReturnDeclarationSummary,
  buildRolitoBagDeclarationItems,
  buildRolitoBagResolutionPayloads,
  clearBagReturnDeclaration,
  computeRolitoBagDeclarationTotals,
  getBagReturnDeclaration,
  matchesBagReturnDeclaration,
  saveBagReturnDeclaration,
} from '../src/modules/produccion/bagReturnDeclarationStore.js'

const originalLocalStorage = globalThis.localStorage

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

test.beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock()
})

test.afterEach(() => {
  globalThis.localStorage = originalLocalStorage
})

test('rolito bag declaration computes damaged vs returned from MP bag settlements', () => {
  const items = buildRolitoBagDeclarationItems([
    {
      settlementId: 91,
      issueId: 77,
      materialId: 777,
      productId: 777,
      lineId: 2,
      shiftId: 27,
      name: 'MP BOLSA LAURITA ROLITO (15KG)',
      issued: 100,
      consumed: 45,
      remaining: 55,
    },
  ])

  const totals = computeRolitoBagDeclarationTotals(items, {
    '91': 5,
  })

  assert.equal(totals.totalIssued, 100)
  assert.equal(totals.totalConsumed, 45)
  assert.equal(totals.totalRemaining, 55)
  assert.equal(totals.totalDamaged, 5)
  assert.equal(totals.totalReturned, 50)

  const [payload] = buildRolitoBagResolutionPayloads(items, { '91': 5 })
  assert.deepEqual(payload, {
    key: '91',
    settlementId: 91,
    shiftId: 27,
    lineId: 2,
    materialId: 777,
    issueId: 77,
    productId: 777,
    name: 'MP BOLSA LAURITA ROLITO (15KG)',
    issued: 100,
    consumed: 45,
    remaining: 55,
    qtyReturned: 50,
    qtyDamaged: 5,
    qtyConsumed: 45,
  })
})

test('saved bag return declaration only matches the exact closing counts', () => {
  const summary = buildBagReturnDeclarationSummary({
    shiftId: 27,
    bagsReceived: 100,
    bagsUsed: 45,
    bagsRemaining: 55,
    totalDamaged: 5,
    totalReturned: 50,
    lines: [],
  })

  assert.equal(saveBagReturnDeclaration({ id: 27 }, summary), true)
  const stored = getBagReturnDeclaration(27)

  assert.equal(matchesBagReturnDeclaration(stored, {
    bagsReceived: 100,
    bagsUsed: 45,
    bagsRemaining: 55,
  }), true)

  assert.equal(matchesBagReturnDeclaration(stored, {
    bagsReceived: 100,
    bagsUsed: 45,
    bagsRemaining: 54,
  }), false)

  assert.equal(clearBagReturnDeclaration(27), true)
  assert.equal(getBagReturnDeclaration(27), null)
})

test('buildRolitoBagDeclarationItems consolidates duplicate rows for the same material even across settlements', () => {
  const items = buildRolitoBagDeclarationItems([
    {
      settlementId: 26,
      issueId: 67,
      materialId: 12,
      productId: 776,
      lineId: 2,
      shiftId: 32,
      name: 'MP BOLSA LAURITA ROLITO (5.5KG)',
      issued: 300,
      consumed: 120,
      remaining: 180,
    },
    {
      settlementId: 29,
      issueId: 68,
      materialId: 12,
      productId: 776,
      lineId: 2,
      shiftId: 32,
      name: 'MP BOLSA LAURITA ROLITO (5.5KG)',
      issued: 200,
      consumed: 80,
      remaining: 120,
    },
  ])

  assert.equal(items.length, 1)
  assert.deepEqual(items[0], {
    key: 'material:12',
    issue_id: 67,
    settlement_id: null,
    material_id: 12,
    product_id: 776,
    line_id: 2,
    shift_id: 32,
    name: 'MP BOLSA LAURITA ROLITO (5.5KG)',
    state: '',
    issued: 500,
    consumed: 200,
    remaining: 300,
  })
})
