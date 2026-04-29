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
    consumed: 200,
    remaining: 300,
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
    consumed: 5,
    remaining: 10,
  })
})
