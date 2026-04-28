import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWarehouseStockByProduct,
  mergeProductsWithWarehouseStock,
} from '../src/modules/admin/posCatalog.js'

test('buildWarehouseStockByProduct aggregates on hand minus reserved by product', () => {
  const byProduct = buildWarehouseStockByProduct([
    { product_id: [10, 'Hielo'], quantity: 8, reserved_quantity: 3 },
    { product_id: [10, 'Hielo'], quantity: 2, reserved_quantity: 0.5 },
    { product_id: [11, 'Combo'], quantity: 1, reserved_quantity: 4 },
  ])

  assert.deepEqual(byProduct, {
    10: 6.5,
    11: 0,
  })
})

test('mergeProductsWithWarehouseStock preserves catalog and injects warehouse stock', () => {
  const merged = mergeProductsWithWarehouseStock(
    [
      { id: 10, name: 'Hielo', list_price: 85, sale_ok: true, available_in_pos: true },
      { id: 11, name: 'Combo', list_price: 120, sale_ok: true, available_in_pos: true },
    ],
    { 10: 6.5 },
  )

  assert.deepEqual(merged, [
    {
      id: 10,
      name: 'Hielo',
      price: 85,
      stock: 6.5,
      barcode: '',
      weight: 0,
      sale_ok: true,
      available_in_pos: true,
    },
    {
      id: 11,
      name: 'Combo',
      price: 120,
      stock: 0,
      barcode: '',
      weight: 0,
      sale_ok: true,
      available_in_pos: true,
    },
  ])
})
