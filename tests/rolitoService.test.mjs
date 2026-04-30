import test from 'node:test'
import assert from 'node:assert/strict'

import { computeAvailableBagMaterials } from '../src/modules/produccion/rolitoService.js'

test('computeAvailableBagMaterials consolidates duplicate issues by material even across settlements', () => {
  const issues = [
    {
      id: 67,
      settlement_id: 26,
      shift_id: 32,
      line_id: 2,
      material_id: 12,
      product_id: 776,
      material_name: 'MP BOLSA LAURITA ROLITO (5.5KG)',
      qty_issued: 300,
      state: 'confirmed',
      settlement_state: 'draft',
    },
    {
      id: 68,
      settlement_id: 29,
      shift_id: 32,
      line_id: 2,
      material_id: 12,
      product_id: 776,
      material_name: 'MP BOLSA LAURITA ROLITO (5.5KG)',
      qty_issued: 200,
      state: 'confirmed',
      settlement_state: 'draft',
    },
    {
      id: 69,
      settlement_id: 24,
      shift_id: 32,
      line_id: 2,
      material_id: 11,
      product_id: 775,
      material_name: 'MP BOLSA LAURITA ROLITO (3KG)',
      qty_issued: 15,
      state: 'confirmed',
      settlement_state: 'draft',
    },
  ]

  const packingEntries = [
    {
      id: 901,
      material_id: 12,
      material_qty_total: 140,
    },
    {
      id: 902,
      material_id: 12,
      material_qty_total: 60,
    },
    {
      id: 903,
      material_id: 11,
      material_qty_total: 5,
    },
  ]

  const rows = computeAvailableBagMaterials(issues, packingEntries)

  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    id: 12,
    key: 'material:12',
    issueId: 67,
    settlementId: null,
    shiftId: 32,
    lineId: 2,
    productId: 776,
    materialId: 12,
    name: 'MP BOLSA LAURITA ROLITO (5.5KG)',
    state: 'draft',
    uom: '',
    issued: 500,
    settlementRemaining: null,
    settlementDamaged: null,
    settlementConsumed: null,
    consumed: 200,
    remaining: 300,
    damaged: 0,
  })
  assert.deepEqual(rows[1], {
    id: 11,
    key: 'material:11',
    issueId: 69,
    settlementId: 24,
    shiftId: 32,
    lineId: 2,
    productId: 775,
    materialId: 11,
    name: 'MP BOLSA LAURITA ROLITO (3KG)',
    state: 'draft',
    uom: '',
    issued: 15,
    settlementRemaining: null,
    settlementDamaged: null,
    settlementConsumed: null,
    consumed: 5,
    remaining: 10,
    damaged: 0,
  })
})

test('computeAvailableBagMaterials prefers settlement return and damage quantities after rolito bag declaration', () => {
  const issues = [
    {
      id: 71,
      settlement_id: 27,
      shift_id: 33,
      line_id: 2,
      material_id: 10,
      product_id: 777,
      material_name: 'MP BOLSA LAURITA ROLITO (15KG)',
      qty_issued: 100,
      state: 'confirmed',
      settlement_state: 'reported',
      settlement_qty_remaining: 48,
      settlement_qty_damaged: 2,
      settlement_qty_consumed: 50,
    },
  ]

  const packingEntries = [
    {
      id: 950,
      material_id: 10,
      material_qty_total: 50,
    },
  ]

  const rows = computeAvailableBagMaterials(issues, packingEntries)

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    id: 10,
    key: 'material:10',
    issueId: 71,
    settlementId: 27,
    shiftId: 33,
    lineId: 2,
    productId: 777,
    materialId: 10,
    name: 'MP BOLSA LAURITA ROLITO (15KG)',
    state: 'reported',
    uom: '',
    issued: 100,
    settlementRemaining: 48,
    settlementDamaged: 2,
    settlementConsumed: 50,
    consumed: 50,
    remaining: 48,
    damaged: 2,
  })
})

test('computeAvailableBagMaterials ignores zeroed settlement balances until a useful return or damage exists', () => {
  const issues = [
    {
      id: 72,
      settlement_id: 28,
      shift_id: 33,
      line_id: 2,
      material_id: 10,
      product_id: 777,
      material_name: 'MP BOLSA LAURITA ROLITO (15KG)',
      qty_issued: 100,
      state: 'confirmed',
      settlement_state: 'reported',
      settlement_qty_remaining: 0,
      settlement_qty_damaged: 0,
      settlement_qty_consumed: 100,
    },
  ]

  const packingEntries = [
    {
      id: 951,
      material_id: 10,
      material_qty_total: 50,
    },
  ]

  const rows = computeAvailableBagMaterials(issues, packingEntries)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].consumed, 50)
  assert.equal(rows[0].remaining, 50)
  assert.equal(rows[0].damaged, 0)
})

test('computeAvailableBagMaterials derives useful return from packing when old settlement damage left remaining at zero', () => {
  const issues = [
    {
      id: 73,
      settlement_id: 27,
      shift_id: 33,
      line_id: 2,
      material_id: 10,
      product_id: 777,
      material_name: 'MP BOLSA LAURITA ROLITO (15KG)',
      qty_issued: 100,
      state: 'confirmed',
      settlement_state: 'reported',
      settlement_qty_remaining: 0,
      settlement_qty_damaged: 2,
      settlement_qty_consumed: 98,
    },
  ]

  const packingEntries = [
    {
      id: 952,
      material_id: 10,
      material_qty_total: 50,
    },
  ]

  const rows = computeAvailableBagMaterials(issues, packingEntries)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].consumed, 50)
  assert.equal(rows[0].remaining, 48)
  assert.equal(rows[0].damaged, 2)
})
