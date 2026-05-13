import test from 'node:test'
import assert from 'node:assert/strict'

import {
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

test('normalizeCustomerResults unwraps direct arrays and nested data arrays', () => {
  const customers = [{ id: 7, name: 'Cliente especial' }]
  assert.deepEqual(normalizeCustomerResults(customers), customers)
  assert.deepEqual(normalizeCustomerResults({ data: customers }), customers)
  assert.deepEqual(normalizeCustomerResults({ data: { customers } }), customers)
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

test('normalizeDefaultCustomerResponse returns null for empty shapes', () => {
  assert.equal(normalizeDefaultCustomerResponse(null), null)
  assert.equal(normalizeDefaultCustomerResponse({ ok: true }), null)
})
