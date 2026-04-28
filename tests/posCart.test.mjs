import test from 'node:test'
import assert from 'node:assert/strict'

import {
  addProductToCart,
  changeCartItemQty,
  stockLabel,
} from '../src/modules/admin/posCart.js'

test('addProductToCart allows a product with zero stock', () => {
  const cart = addProductToCart([], {
    id: 10,
    name: 'Hielo',
    stock: 0,
    price: 85,
  })

  assert.deepEqual(cart, [
    {
      product_id: 10,
      name: 'Hielo',
      qty: 1,
      price_unit: 85,
      stock: 0,
    },
  ])
})

test('changeCartItemQty allows quantity above visible stock', () => {
  const cart = changeCartItemQty([
    {
      product_id: 10,
      name: 'Hielo',
      qty: 1,
      price_unit: 85,
      stock: 0,
    },
  ], 10, 1)

  assert.equal(cart[0].qty, 2)
})

test('changeCartItemQty removes the row when quantity drops to zero', () => {
  const cart = changeCartItemQty([
    {
      product_id: 10,
      name: 'Hielo',
      qty: 1,
      price_unit: 85,
      stock: 0,
    },
  ], 10, -1)

  assert.deepEqual(cart, [])
})

test('stockLabel stays neutral when stock is zero', () => {
  assert.equal(stockLabel(0), 'Stock 0')
})
