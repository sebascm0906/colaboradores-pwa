import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canRefreshCustomerPricelist,
  normalizeDefaultCustomerResponse,
  normalizeCustomerResults,
  shouldLoadCustomerSuggestions,
} from '../src/modules/admin/posCustomers.js'

test('shouldLoadCustomerSuggestions loads defaults for empty queries', () => {
  assert.equal(shouldLoadCustomerSuggestions(''), true)
  assert.equal(shouldLoadCustomerSuggestions('   '), true)
})

test('shouldLoadCustomerSuggestions waits for at least two characters when query is not empty', () => {
  assert.equal(shouldLoadCustomerSuggestions('a'), false)
  assert.equal(shouldLoadCustomerSuggestions('ab'), true)
})

test('canRefreshCustomerPricelist requires a selected customer', () => {
  assert.equal(canRefreshCustomerPricelist({ id: 11, name: 'Cliente con lista' }), true)
  assert.equal(canRefreshCustomerPricelist({ id: 0, name: 'VENTA PUBLICO' }), false)
  assert.equal(canRefreshCustomerPricelist(null), false)
})

test('normalizeCustomerResults unwraps direct arrays and nested data arrays', () => {
  const customers = [{ id: 7, name: 'Cliente especial' }]
  assert.deepEqual(normalizeCustomerResults(customers), customers)
  assert.deepEqual(normalizeCustomerResults({ data: customers }), customers)
  assert.deepEqual(normalizeCustomerResults({ data: { customers } }), customers)
})

test('normalizeCustomerResults maps Odoo customer relation shapes to id and name', () => {
  assert.deepEqual(
    normalizeCustomerResults({
      data: {
        customers: [
          { partner_id: [44, 'Cliente con tarifa'], vat: 'RFC123' },
          { customer_id: 45, display_name: 'Cliente display' },
        ],
      },
    }),
    [
      { partner_id: [44, 'Cliente con tarifa'], vat: 'RFC123', id: 44, name: 'Cliente con tarifa' },
      { customer_id: 45, display_name: 'Cliente display', id: 45, name: 'Cliente display' },
    ],
  )
})

test('normalizeCustomerResults falls back to an empty array for unknown shapes', () => {
  assert.deepEqual(normalizeCustomerResults({ ok: true }), [])
  assert.deepEqual(normalizeCustomerResults(null), [])
})

test('normalizeDefaultCustomerResponse unwraps customer payloads', () => {
  const customer = { id: 11, name: 'Publico General' }
  assert.deepEqual(normalizeDefaultCustomerResponse(customer), customer)
  assert.deepEqual(normalizeDefaultCustomerResponse({ data: customer }), customer)
  assert.deepEqual(normalizeDefaultCustomerResponse({ data: { customer } }), customer)
})

test('normalizeDefaultCustomerResponse maps Odoo relation shapes', () => {
  assert.deepEqual(
    normalizeDefaultCustomerResponse({ data: { customer: { partner_id: [11, 'Publico Mostrador'] } } }),
    { partner_id: [11, 'Publico Mostrador'], id: 11, name: 'Publico Mostrador' },
  )
})

test('normalizeDefaultCustomerResponse returns null for empty shapes', () => {
  assert.equal(normalizeDefaultCustomerResponse(null), null)
  assert.equal(normalizeDefaultCustomerResponse({ ok: true }), null)
})
