import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildChecklistPath,
  resolveChecklistLineType,
  resolveChecklistRoleContext,
} from '../src/modules/produccion/checklistContext.js'

test('resolveChecklistRoleContext prefers explicit requested role over stored module role', () => {
  const session = {
    role: 'operador_rolito',
    additional_job_keys: ['operador_barra'],
    module_role_contexts: { registro_produccion: 'operador_rolito' },
  }

  assert.equal(resolveChecklistRoleContext(session, 'operador_barra'), 'operador_barra')
})

test('resolveChecklistRoleContext falls back to stored production module role', () => {
  const session = {
    role: 'operador_rolito',
    additional_job_keys: ['operador_barra'],
    module_role_contexts: { registro_produccion: 'operador_barra' },
  }

  assert.equal(resolveChecklistRoleContext(session), 'operador_barra')
})

test('resolveChecklistLineType maps barra and rolito roles to the expected line type', () => {
  assert.equal(resolveChecklistLineType('operador_barra'), 'barras')
  assert.equal(resolveChecklistLineType('operador_rolito'), 'rolito')
  assert.equal(resolveChecklistLineType('auxiliar_produccion'), 'all')
})

test('buildChecklistPath appends role context and line type when role is known', () => {
  assert.equal(
    buildChecklistPath(17, 'operador_barra'),
    '/pwa-prod/checklist?shift_id=17&role_context=operador_barra&line_type=barras',
  )
})
