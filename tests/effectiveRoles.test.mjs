import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeAdditionalRoles,
  getEffectiveRoles,
  hasEffectiveRole,
} from '../src/lib/effectiveRoles.js'

test('normalizeAdditionalRoles returns [] for missing payloads', () => {
  assert.deepEqual(normalizeAdditionalRoles(undefined), [])
  assert.deepEqual(normalizeAdditionalRoles(null), [])
  assert.deepEqual(normalizeAdditionalRoles('gerente_sucursal'), [])
})

test('getEffectiveRoles keeps primary role first and removes duplicates', () => {
  const session = {
    role: 'auxiliar_admin',
    additional_roles: ['gerente_sucursal', 'auxiliar_admin', 'gerente_sucursal'],
  }

  assert.deepEqual(getEffectiveRoles(session), ['auxiliar_admin', 'gerente_sucursal'])
})

test('hasEffectiveRole checks both primary and additional roles', () => {
  const session = {
    role: 'auxiliar_admin',
    additional_roles: ['gerente_sucursal'],
  }

  assert.equal(hasEffectiveRole(session, 'auxiliar_admin'), true)
  assert.equal(hasEffectiveRole(session, 'gerente_sucursal'), true)
  assert.equal(hasEffectiveRole(session, 'almacenista_pt'), false)
})
