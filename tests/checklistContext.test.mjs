import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildChecklistCacheKey,
  buildChecklistPath,
  getChecklistTemplateLineTypeCandidates,
  resolveChecklistBackTarget,
  resolveChecklistLineType,
  resolveChecklistRoleContext,
  selectChecklistForShift,
  shouldBackfillShiftChecklistLink,
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

test('resolveChecklistBackTarget preserves safe supervision return target', () => {
  assert.equal(
    resolveChecklistBackTarget({ backTo: '/supervision' }),
    '/supervision',
  )
})

test('resolveChecklistBackTarget falls back to production for unsafe return target', () => {
  assert.equal(
    resolveChecklistBackTarget({ backTo: 'https://evil.example/path' }),
    '/produccion',
  )
})

test('buildChecklistCacheKey separates checklist requests by role context and line type', () => {
  assert.notEqual(
    buildChecklistCacheKey(17, 'operador_rolito', 'rolito'),
    buildChecklistCacheKey(17, 'operador_barra', 'barras'),
  )
})

test('shouldBackfillShiftChecklistLink backfills completed checklist missing from shift', () => {
  assert.equal(
    shouldBackfillShiftChecklistLink(
      { id: 41, shift_id: 17, state: 'completed' },
      { id: 17, haccp_checklist_id: null },
    ),
    true,
  )
})

test('shouldBackfillShiftChecklistLink repoints a pending linked checklist to a completed one', () => {
  assert.equal(
    shouldBackfillShiftChecklistLink(
      { id: 42, shift_id: 17, state: 'completed' },
      { id: 17, haccp_checklist_id: [41, 'HACCP viejo'] },
      { id: 41, shift_id: 17, state: 'pending' },
    ),
    true,
  )
})

test('shouldBackfillShiftChecklistLink keeps an already completed linked checklist', () => {
  assert.equal(
    shouldBackfillShiftChecklistLink(
      { id: 42, shift_id: 17, state: 'completed' },
      { id: 17, haccp_checklist_id: [41, 'HACCP viejo'] },
      { id: 41, shift_id: 17, state: 'completed' },
    ),
    false,
  )
})

test('getChecklistTemplateLineTypeCandidates falls back from line-specific templates to all', () => {
  assert.deepEqual(getChecklistTemplateLineTypeCandidates('rolito'), ['rolito', 'all'])
  assert.deepEqual(getChecklistTemplateLineTypeCandidates('barras'), ['barras', 'all'])
  assert.deepEqual(getChecklistTemplateLineTypeCandidates('all'), ['all'])
})

test('selectChecklistForShift prefers completed checklist over newer pending duplicate', () => {
  assert.deepEqual(
    selectChecklistForShift([
      { id: 43, state: 'pending' },
      { id: 42, state: 'completed' },
      { id: 41, state: 'failed' },
    ]),
    { id: 42, state: 'completed' },
  )
})

test('selectChecklistForShift falls back to the first checklist when none is completed', () => {
  assert.deepEqual(
    selectChecklistForShift([
      { id: 43, state: 'pending' },
      { id: 41, state: 'failed' },
    ]),
    { id: 43, state: 'pending' },
  )
})
