import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildKoldcupClosePayload,
  buildKoldcupPurchasePayload,
  buildKoldcupTransferPayload,
} from '../src/modules/koldcup/koldcupService.js'

test('builds KOLDCUP purchase payload with numeric fields', () => {
  assert.deepEqual(buildKoldcupPurchasePayload({
    warehouseId: '76',
    employeeId: '9',
    supplierId: '5',
    productId: '7',
    qty: '10',
    unitPrice: '120',
    notes: ' compra ',
  }), {
    warehouse_id: 76,
    employee_id: 9,
    supplier_id: 5,
    product_id: 7,
    qty: 10,
    unit_price: 120,
    notes: 'compra',
  })
})

test('builds KOLDCUP close payload', () => {
  assert.deepEqual(buildKoldcupClosePayload({
    warehouseId: '76',
    employeeId: '9',
    date: '2026-05-09',
    finalInputCount: '4',
    finalFinishedCount: '2500',
    differenceReason: ' cierre ',
  }), {
    warehouse_id: 76,
    employee_id: 9,
    date: '2026-05-09',
    final_input_count: 4,
    final_finished_count: 2500,
    difference_reason: 'cierre',
  })
})

test('builds KOLDCUP transfer payload', () => {
  assert.deepEqual(buildKoldcupTransferPayload({
    warehouseId: '76',
    employeeId: '9',
    date: '2026-05-09',
    productId: '888',
    qty: '2500',
  }), {
    warehouse_id: 76,
    employee_id: 9,
    date: '2026-05-09',
    product_id: 888,
    qty: 2500,
  })
})
