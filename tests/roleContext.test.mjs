import test from 'node:test'
import assert from 'node:assert/strict'

import { getModuleById, getModulesForRoles } from '../src/modules/registry.js'
import {
  getEffectiveJobKeys,
  getModuleEntryDecision,
  normalizeSessionRoleContext,
  resolveModuleContextRole,
  upsertModuleRoleContext,
} from '../src/lib/roleContext.js'

test('getEffectiveJobKeys merges primary and additional roles without duplicates', () => {
  assert.deepEqual(
    getEffectiveJobKeys({
      role: 'almacenista_pt',
      additional_job_keys: [' supervisor_ventas ', 'almacenista_pt', '', 'supervisor_ventas'],
    }),
    ['almacenista_pt', 'supervisor_ventas'],
  )
})

test('normalizeSessionRoleContext keeps normalized additional_job_keys and valid module contexts', () => {
  assert.deepEqual(
    normalizeSessionRoleContext({
      role: 'auxiliar_admin',
      additional_job_keys: [' gerente_sucursal ', 'auxiliar_admin', '', 'gerente_sucursal'],
      module_role_contexts: {
        admin_sucursal: ' gerente_sucursal ',
        registro_produccion: '',
      },
    }),
    {
      role: 'auxiliar_admin',
      additional_job_keys: ['gerente_sucursal'],
      module_role_contexts: { admin_sucursal: 'gerente_sucursal' },
    },
  )
})

test('normalizeSessionRoleContext accepts legacy additional_roles as fallback input', () => {
  assert.deepEqual(
    normalizeSessionRoleContext({
      role: 'auxiliar_admin',
      additional_roles: [' gerente_sucursal ', 'auxiliar_admin'],
    }),
    {
      role: 'auxiliar_admin',
      additional_roles: [' gerente_sucursal ', 'auxiliar_admin'],
      additional_job_keys: ['gerente_sucursal'],
      module_role_contexts: {},
    },
  )
})

test('getModulesForRoles returns one module card per module across effective roles', () => {
  const modules = getModulesForRoles(['almacenista_pt', 'supervisor_ventas', 'almacenista_pt'])
  assert.deepEqual(
    modules.map((module) => module.id),
    ['kpis', 'encuestas', 'logros', 'almacen_pt', 'supervisor_ventas'],
  )
})

test('getModuleEntryDecision returns direct access when only one compatible role exists for the module context', () => {
  const decision = getModuleEntryDecision(
    getModuleById('almacen_pt'),
    { role: 'almacenista_pt', additional_job_keys: ['supervisor_ventas'] },
  )

  assert.deepEqual(decision, {
    type: 'direct',
    compatibleRoles: ['almacenista_pt'],
    selectedRole: 'almacenista_pt',
  })
})

test('getModuleEntryDecision requires explicit choice when a shared module has multiple compatible roles', () => {
  const decision = getModuleEntryDecision(
    getModuleById('admin_sucursal'),
    { role: 'auxiliar_admin', additional_job_keys: ['gerente_sucursal'] },
  )

  assert.deepEqual(decision, {
    type: 'choose',
    compatibleRoles: ['auxiliar_admin', 'gerente_sucursal'],
    selectedRole: '',
  })
})

test('resolveModuleContextRole uses stored module role when it stays compatible', () => {
  const session = {
    role: 'operador_barra',
    additional_job_keys: ['operador_rolito'],
    module_role_contexts: { registro_produccion: 'operador_rolito' },
  }

  assert.equal(
    resolveModuleContextRole(session, getModuleById('registro_produccion')),
    'operador_rolito',
  )
})

test('resolveModuleContextRole prioritizes an explicitly requested compatible role', () => {
  const session = {
    role: 'operador_barra',
    additional_job_keys: ['operador_rolito'],
    module_role_contexts: { registro_produccion: 'operador_barra' },
  }

  assert.equal(
    resolveModuleContextRole(session, getModuleById('registro_produccion'), 'operador_rolito'),
    'operador_rolito',
  )
})

test('upsertModuleRoleContext persists a module-specific role selection', () => {
  assert.deepEqual(
    upsertModuleRoleContext({ admin_sucursal: 'auxiliar_admin' }, 'registro_produccion', 'operador_barra'),
    {
      admin_sucursal: 'auxiliar_admin',
      registro_produccion: 'operador_barra',
    },
  )
})
