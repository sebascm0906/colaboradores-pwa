import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPosCatalogPath,
  normalizePosCatalogResponse,
  normalizePosProductsResponse,
} from '../src/modules/admin/posProducts.js'

test('buildPosCatalogPath includes company and partner filters when present', () => {
  assert.equal(
    buildPosCatalogPath({ warehouseId: 76, companyId: 35, partnerId: 9001 }),
    '/pwa-admin/pos-products?warehouse_id=76&company_id=35&partner_id=9001',
  )
})

test('normalizePosCatalogResponse preserves products and pricelist metadata', () => {
  const catalog = normalizePosCatalogResponse({
    data: {
      pricelist_id: 88,
      pricelist_name: 'Cliente especial',
      products: [{ id: 4, name: 'Bolsa de hielo' }],
    },
  })

  assert.deepEqual(catalog, {
    pricelist_id: 88,
    pricelist_name: 'Cliente especial',
    products: [{ id: 4, name: 'Bolsa de hielo' }],
  })
})

test('normalizePosCatalogResponse maps Odoo many2one pricelist metadata', () => {
  const catalog = normalizePosCatalogResponse({
    data: {
      pricelist_id: [88, 'Lista cliente mayorista'],
      products: [{ id: 4, name: 'Bolsa de hielo' }],
    },
  })

  assert.deepEqual(catalog, {
    pricelist_id: 88,
    pricelist_name: 'Lista cliente mayorista',
    products: [{ id: 4, name: 'Bolsa de hielo' }],
  })
})

test('normalizePosCatalogResponse maps nested pricelist metadata', () => {
  const catalog = normalizePosCatalogResponse({
    data: {
      pricelist: { id: 91, name: 'Lista especial gerente' },
      products: [{ id: 5, name: 'Molido chico' }],
    },
  })

  assert.deepEqual(catalog, {
    pricelist_id: 91,
    pricelist_name: 'Lista especial gerente',
    products: [{ id: 5, name: 'Molido chico' }],
  })
})

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
