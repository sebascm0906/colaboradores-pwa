import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildLiquidacionViewModel } from '../src/modules/ruta/liquidacionViewModel.js'

test('buildLiquidacionViewModel uses expected buckets and only defaults physical cash as editable', () => {
  const view = buildLiquidacionViewModel({
    expected_payments: {
      cash: { count: 1, total: 598 },
      credit: { count: 5, total: 6870 },
      transfer: { count: 0, total: 0 },
    },
    payments: {
      cash: { count: 0, total: 0 },
      credit: { count: 0, total: 0 },
      transfer: { count: 0, total: 0 },
    },
    total_expected: 7468,
    payment_breakdown: {
      cash: {
        order_count: 1,
        unit_total: 26,
        amount_total: 598,
        orders: [{ name: 'S14615', unit_total: 26, amount_total: 598, lines: [] }],
      },
    },
  })

  assert.equal(view.cashExpected, 598)
  assert.equal(view.creditExpected, 6870)
  assert.equal(view.transferExpected, 0)
  assert.equal(view.cashCollected, 0)
  assert.equal(view.creditCollected, 6870)
  assert.equal(view.transferCollected, 0)
  assert.equal(view.totalExpected, 7468)
  assert.equal(view.totalCollected, 6870)
  assert.equal(view.totalDiff, -598)
  assert.equal(view.paymentBreakdown.cash.order_count, 1)
  assert.equal(view.paymentBreakdown.cash.orders[0].name, 'S14615')
})

test('buildLiquidacionViewModel falls back total_expected to cash expected when buckets are absent', () => {
  const view = buildLiquidacionViewModel({
    payments: {
      cash: { count: 0, total: 0 },
      credit: { count: 0, total: 0 },
      transfer: { count: 0, total: 0 },
    },
    total_expected: 7468,
  })

  assert.equal(view.cashExpected, 7468)
  assert.equal(view.creditExpected, 0)
  assert.equal(view.totalExpected, 7468)
})
