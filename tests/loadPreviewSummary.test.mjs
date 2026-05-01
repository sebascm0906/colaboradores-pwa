import test from 'node:test'
import assert from 'node:assert/strict'

import { buildLoadPreviewSummary } from '../src/modules/entregas/loadPreviewSummary.js'

test('buildLoadPreviewSummary aggregates repeated products and computes remaining stock', () => {
  assert.deepEqual(buildLoadPreviewSummary({
    lines: [
      { product_id: '10', qty: '3', product_name: 'Hielo 5kg' },
      { product_id: '10', qty: '2', product_name: 'Hielo 5kg' },
      { product_id: '11', qty: '4', product_name: 'Bolsa 2kg' },
    ],
    stockItems: [
      { product_id: 10, on_hand: 12 },
      { product_id: 11, on_hand: 3 },
    ],
  }), [
    {
      product_id: 10,
      product_name: 'Hielo 5kg',
      requested: 5,
      onHand: 12,
      remaining: 7,
      sufficient: true,
    },
    {
      product_id: 11,
      product_name: 'Bolsa 2kg',
      requested: 4,
      onHand: 3,
      remaining: -1,
      sufficient: false,
    },
  ])
})

test('buildLoadPreviewSummary ignores incomplete or zero-qty rows', () => {
  assert.deepEqual(buildLoadPreviewSummary({
    lines: [
      { product_id: '', qty: '8', product_name: 'Ignorar' },
      { product_id: '22', qty: '0', product_name: 'Ignorar 2' },
      { product_id: '21', qty: '6', product_name: 'Agua' },
    ],
    stockItems: [],
  }), [
    {
      product_id: 21,
      product_name: 'Agua',
      requested: 6,
      onHand: 0,
      remaining: -6,
      sufficient: false,
    },
  ])
})
