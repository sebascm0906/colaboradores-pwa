import test from 'node:test'
import assert from 'node:assert/strict'

import {
  addProductToCart,
  changeCartItemQty,
  repriceCartFromCatalog,
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

test('repriceCartFromCatalog updates each line with the selected customer prices', () => {
  const repriced = repriceCartFromCatalog([
    {
      product_id: 10,
      name: 'Hielo 5kg',
      qty: 2,
      price_unit: 85,
      stock: 10,
    },
    {
      product_id: 11,
      name: 'Molido chico',
      qty: 1,
      price_unit: 90,
      stock: 4,
    },
  ], [
    { id: 10, price: 70, stock: 8 },
    { id: 11, price: 120, stock: 3 },
  ])

  assert.deepEqual(repriced, [
    {
      product_id: 10,
      name: 'Hielo 5kg',
      qty: 2,
      price_unit: 70,
      stock: 8,
    },
    {
      product_id: 11,
      name: 'Molido chico',
      qty: 1,
      price_unit: 120,
      stock: 3,
    },
  ])
})

test('repriceCartFromCatalog keeps the old line values when the product is missing from the new catalog', () => {
  const repriced = repriceCartFromCatalog([
    {
      product_id: 10,
      name: 'Hielo 5kg',
      qty: 2,
      price_unit: 85,
      stock: 10,
    },
  ], [])

  assert.deepEqual(repriced, [
    {
      product_id: 10,
      name: 'Hielo 5kg',
      qty: 2,
      price_unit: 85,
      stock: 10,
    },
  ])
})
