import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeRolitoBagDifference,
  sumRolitoLocationStock,
  sumRolitoUsedBags,
} from '../src/modules/produccion/rolitoBagMath.js'

test('sumRolitoUsedBags prefers material_qty_total over packed output bags', () => {
  const total = sumRolitoUsedBags([
    { id: 1, qty_bags: 650, material_qty_total: 300 },
    { id: 2, qty_bags: 273, material_qty_total: 200 },
    { id: 3, qty_bags: 0, material_qty_total: 423 },
  ])

  assert.equal(total, 923)
})

test('computeRolitoBagDifference uses received - used - remaining - damaged', () => {
  const diff = computeRolitoBagDifference({
    bagsReceived: 1230,
    bagsUsed: 835,
    bagsRemaining: 395,
    bagsDamaged: 0,
  })

  assert.equal(diff, 0)
})

test('sumRolitoLocationStock uses on-hand quantity instead of available quantity', () => {
  const total = sumRolitoLocationStock([
    { id: 10, quantity: 395, available_quantity: 29, reserved_quantity: 366 },
  ])

  assert.equal(total, 395)
})
