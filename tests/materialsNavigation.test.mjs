import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMaterialesNavState,
  defaultMaterialesBackToForRole,
  resolveMaterialesBackTo,
} from '../src/modules/almacen-pt/materialsNavigation.js'

test('resolveMaterialesBackTo uses a safe fallback when state is missing', () => {
  assert.equal(resolveMaterialesBackTo(undefined, '/almacen-pt'), '/almacen-pt')
})

test('resolveMaterialesBackTo prefers backTo from navigation state', () => {
  assert.equal(
    resolveMaterialesBackTo({ backTo: '/admin' }, '/almacen-pt'),
    '/admin',
  )
})

test('resolveMaterialesBackTo ignores unsafe values', () => {
  assert.equal(
    resolveMaterialesBackTo({ backTo: 'javascript:alert(1)' }, '/almacen-pt/materiales'),
    '/almacen-pt/materiales',
  )
})

test('resolveMaterialesBackTo falls back by role when state is missing', () => {
  assert.equal(
    resolveMaterialesBackTo(undefined, '/almacen-pt', 'operador_rolito'),
    '/produccion',
  )
})

test('buildMaterialesNavState preserves extra state and normalized back target', () => {
  assert.deepEqual(
    buildMaterialesNavState({ issue: { id: 17 }, backTo: '/admin' }, '/almacen-pt/materiales'),
    { issue: { id: 17 }, backTo: '/admin' },
  )
})

test('buildMaterialesNavState injects fallback back target when caller omitted it', () => {
  assert.deepEqual(
    buildMaterialesNavState({ issue: { id: 9 } }, '/almacen-pt/materiales'),
    { issue: { id: 9 }, backTo: '/almacen-pt/materiales' },
  )
})

test('defaultMaterialesBackToForRole maps production roles to their hub', () => {
  assert.equal(defaultMaterialesBackToForRole('operador_barra'), '/produccion')
  assert.equal(defaultMaterialesBackToForRole('operador_rolito'), '/produccion')
  assert.equal(defaultMaterialesBackToForRole('supervisor_produccion'), '/supervision')
})
