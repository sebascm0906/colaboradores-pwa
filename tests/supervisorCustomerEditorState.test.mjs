import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCustomerEditorDraft,
  buildSupervisorCustomerUpdatePayload,
  getCustomerEditorValidationError,
  hasCustomerEditorChanges,
  normalizeSupervisorCustomer,
} from '../src/modules/supervisor-ventas/customerEditorState.js'

test('normalizeSupervisorCustomer shapes editable and read-only fields', () => {
  const customer = normalizeSupervisorCustomer({
    id: 55,
    name: 'Farmapronto Centro',
    phone: '7331234567',
    email: 'cliente@correo.com',
    latitude: 20.7211203,
    longitude: -103.3913671,
    street: 'Av. Hidalgo 10',
    street2: 'Local B',
    city: 'Iguala',
    state_id: [14, 'Guerrero'],
    zip: '40000',
    ref: 'Frente a mercado',
  })

  assert.deepEqual(customer, {
    id: 55,
    name: 'Farmapronto Centro',
    phone: '7331234567',
    email: 'cliente@correo.com',
    latitude: '20.7211203',
    longitude: '-103.3913671',
    address: 'Av. Hidalgo 10, Local B, Iguala, Guerrero, 40000',
    reference: 'Frente a mercado',
  })
})

test('hasCustomerEditorChanges ignores equivalent numeric formats and detects real edits', () => {
  const original = normalizeSupervisorCustomer({
    id: 1,
    name: 'Cliente Uno',
    phone: '7331111111',
    email: 'uno@correo.com',
    latitude: 20.5,
    longitude: -99.25,
  })

  assert.equal(hasCustomerEditorChanges(original, {
    ...buildCustomerEditorDraft(original),
    latitude: '20.5000',
    longitude: '-99.25',
  }), false)

  assert.equal(hasCustomerEditorChanges(original, {
    ...buildCustomerEditorDraft(original),
    phone: '7339999999',
  }), true)
})

test('buildSupervisorCustomerUpdatePayload only sends changed editable fields', () => {
  const original = normalizeSupervisorCustomer({
    id: 77,
    name: 'Cliente Dos',
    phone: '7330000000',
    email: 'dos@correo.com',
    latitude: 20.72,
    longitude: -103.39,
  })

  const payload = buildSupervisorCustomerUpdatePayload(77, original, {
    ...buildCustomerEditorDraft(original),
    name: 'Cliente Dos Renovado',
    email: '',
    longitude: '-103.4',
  })

  assert.deepEqual(payload, {
    customer_id: 77,
    values: {
      name: 'Cliente Dos Renovado',
      email: false,
      longitude: -103.4,
    },
  })
})

test('getCustomerEditorValidationError requires name and numeric geo fields', () => {
  assert.equal(getCustomerEditorValidationError({
    name: '',
    latitude: '',
    longitude: '',
  }), 'El nombre del cliente es obligatorio.')

  assert.equal(getCustomerEditorValidationError({
    name: 'Cliente',
    latitude: 'abc',
    longitude: '',
  }), 'La latitud debe ser numerica.')

  assert.equal(getCustomerEditorValidationError({
    name: 'Cliente',
    latitude: '20.7',
    longitude: '-103.3',
  }), '')
})
