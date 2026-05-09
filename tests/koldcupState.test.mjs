import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeKoldcupSteps,
  normalizeKoldcupSummary,
  validateKoldcupCloseDraft,
  validateKoldcupPurchaseDraft,
} from '../src/modules/koldcup/koldcupState.js'

test('normalizes missing KOLDCUP day summary safely', () => {
  const summary = normalizeKoldcupSummary(null)

  assert.equal(summary.purchase.totalAmount, 0)
  assert.equal(summary.production.outputQty, 0)
  assert.equal(summary.close.canClose, false)
  assert.deepEqual(summary.close.blockers, ['Resumen KOLDCUP no disponible'])
})

test('normalizes backend KOLDCUP day summary fields', () => {
  const summary = normalizeKoldcupSummary({
    purchase: { count: 1, total_amount: 1200, has_unlinked_cash_out: false },
    production: { input_qty: 10, output_qty: 2500, scrap_qty: 2 },
    inventory: { input_available_qty: 4, finished_available_qty: 2498 },
    close: { state: 'open', can_close: true, blockers: [], warnings: ['Revisar diferencia'] },
    transfer: { state: 'pending', picking_id: null },
  })

  assert.equal(summary.purchase.count, 1)
  assert.equal(summary.purchase.totalAmount, 1200)
  assert.equal(summary.production.inputQty, 10)
  assert.equal(summary.production.outputQty, 2500)
  assert.equal(summary.inventory.finishedAvailableQty, 2498)
  assert.equal(summary.close.canClose, true)
  assert.equal(summary.transfer.state, 'pending')
})

test('computes KOLDCUP step states from summary', () => {
  const summary = normalizeKoldcupSummary({
    purchase: { count: 1, total_amount: 1200 },
    production: { output_qty: 2500 },
    close: { state: 'open', can_close: true, blockers: [] },
    transfer: { state: 'pending' },
  })

  const steps = computeKoldcupSteps(summary)

  assert.equal(steps.find((s) => s.id === 'compra').status, 'completed')
  assert.equal(steps.find((s) => s.id === 'produccion').status, 'completed')
  assert.equal(steps.find((s) => s.id === 'corte').status, 'in_progress')
  assert.equal(steps.find((s) => s.id === 'traspaso').status, 'pending')
})

test('flags purchase validation errors', () => {
  assert.deepEqual(validateKoldcupPurchaseDraft({}), {
    product_id: 'Selecciona un insumo',
    qty: 'Captura cantidad mayor a cero',
    unit_price: 'Captura precio mayor a cero',
  })
})

test('requires difference reason when close count differs', () => {
  const errors = validateKoldcupCloseDraft({
    final_input_count: 2,
    final_finished_count: 20,
    expected_input_count: 3,
    expected_finished_count: 20,
    difference_reason: '',
  })

  assert.equal(errors.difference_reason, 'Explica la diferencia antes de cerrar')
})
