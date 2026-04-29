import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizePosProductsResponse } from '../src/modules/admin/posProducts.js'

test('normalizePosProductsResponse returns direct arrays unchanged', () => {
  const products = [{ id: 1, name: 'Hielo 5 kg' }]
  assert.deepEqual(normalizePosProductsResponse(products), products)
})

test('normalizePosProductsResponse unwraps top-level products arrays', () => {
  const products = [{ id: 2, name: 'Paleta mango' }]
  assert.deepEqual(
    normalizePosProductsResponse({ products }),
    products,
  )
})

test('normalizePosProductsResponse unwraps nested data arrays', () => {
  const products = [{ id: 3, name: 'Bolsa de hielo' }]
  assert.deepEqual(
    normalizePosProductsResponse({ data: products }),
    products,
  )
})

test('normalizePosProductsResponse unwraps nested data.products arrays', () => {
  const products = [{ id: 4, name: 'Agua mineral' }]
  assert.deepEqual(
    normalizePosProductsResponse({ data: { products } }),
    products,
  )
})

test('normalizePosProductsResponse falls back to an empty array for unknown shapes', () => {
  assert.deepEqual(normalizePosProductsResponse({ ok: true }), [])
  assert.deepEqual(normalizePosProductsResponse(null), [])
})
