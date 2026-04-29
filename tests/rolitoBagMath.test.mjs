import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRolitoPackedByMaterial,
  computeRolitoBagDifference,
  getRolitoRelationId,
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

test('getRolitoRelationId extracts ids from Odoo many2one values', () => {
  assert.equal(getRolitoRelationId([12, 'MP BOLSA LAURITA ROLITO (5.5KG)']), 12)
  assert.equal(getRolitoRelationId({ id: 7 }), 7)
  assert.equal(getRolitoRelationId('9'), 9)
  assert.equal(getRolitoRelationId(null), 0)
})

test('buildRolitoPackedByMaterial groups packing rows even when material_id comes as many2one arrays', () => {
  const packed = buildRolitoPackedByMaterial([
    { id: 1, material_id: [12, 'MP BOLSA LAURITA ROLITO (5.5KG)'], material_qty_total: 500 },
    { id: 2, material_id: [12, 'MP BOLSA LAURITA ROLITO (5.5KG)'], material_qty_total: 200 },
    { id: 3, material_id: [11, 'MP BOLSA LAURITA ROLITO (3KG)'], material_qty_total: 30 },
  ])

  assert.deepEqual(packed, {
    11: 30,
    12: 700,
  })
})
