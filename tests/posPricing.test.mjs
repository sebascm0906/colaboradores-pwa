import test from 'node:test'
import assert from 'node:assert/strict'

import { computePosSummary } from '../src/modules/admin/posPricing.js'

test('computePosSummary returns total equal to subtotal without automatic IVA', () => {
  const summary = computePosSummary([
    { qty: 2, price_unit: 85 },
    { qty: 1, price_unit: 120.5 },
  ])

  assert.deepEqual(summary, {
    subtotal: 290.5,
    tax: 0,
    total: 290.5,
  })
})
