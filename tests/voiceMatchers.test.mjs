import test from 'node:test'
import assert from 'node:assert/strict'

import {
  matchByKeyword,
  matchByFuzzyName,
  matchByNumericId,
} from '../src/modules/shared/voice/voiceMatchers.js'

// ─── matchByKeyword ────────────────────────────────────────────────────────

test('matchByKeyword returns the item when keyword substring matches item.name', () => {
  const reasons = [
    { id: 1, name: 'Derretido' },
    { id: 2, name: 'Roto / dañado' },
    { id: 3, name: 'Contaminado' },
  ]
  const map = { derretimiento: 'derret', contaminacion: 'contamina', golpe: 'roto' }
  assert.deepEqual(matchByKeyword('derretimiento', reasons, map), reasons[0])
  assert.deepEqual(matchByKeyword('contaminacion', reasons, map), reasons[2])
  assert.deepEqual(matchByKeyword('golpe', reasons, map), reasons[1])
})

test('matchByKeyword returns null when llmValue is not in keywordMap', () => {
  const reasons = [{ id: 1, name: 'Derretido' }]
  const map = { derretimiento: 'derret' }
  assert.equal(matchByKeyword('robo', reasons, map), null)
  assert.equal(matchByKeyword('otro', reasons, map), null)
})

test('matchByKeyword returns null for null/undefined/empty inputs', () => {
  const reasons = [{ id: 1, name: 'Derretido' }]
  const map = { derretimiento: 'derret' }
  assert.equal(matchByKeyword(null, reasons, map), null)
  assert.equal(matchByKeyword(undefined, reasons, map), null)
  assert.equal(matchByKeyword('', reasons, map), null)
  assert.equal(matchByKeyword('derretimiento', null, map), null)
  assert.equal(matchByKeyword('derretimiento', [], map), null)
  assert.equal(matchByKeyword('derretimiento', reasons, null), null)
  assert.equal(matchByKeyword('derretimiento', reasons, undefined), null)
})

test('matchByKeyword is case-insensitive on the item side', () => {
  const reasons = [{ id: 1, name: 'DERRETIDO' }]
  assert.deepEqual(
    matchByKeyword('derretimiento', reasons, { derretimiento: 'DERRET' }),
    reasons[0],
  )
  assert.deepEqual(
    matchByKeyword('derretimiento', reasons, { derretimiento: 'derret' }),
    reasons[0],
  )
})

test('matchByKeyword accepts a custom field name', () => {
  const items = [
    { id: 1, label: 'Falta de agua' },
    { id: 2, label: 'Corte de energia' },
  ]
  const map = { electricidad: 'energia' }
  assert.deepEqual(
    matchByKeyword('electricidad', items, map, 'label'),
    items[1],
  )
})

test('matchByKeyword ignores items with empty/missing name field', () => {
  const reasons = [
    { id: 1, name: '' },
    { id: 2, name: null },
    { id: 3, name: 'Derretido' },
  ]
  assert.deepEqual(
    matchByKeyword('derretimiento', reasons, { derretimiento: 'derret' }),
    reasons[2],
  )
})

// ─── matchByFuzzyName ──────────────────────────────────────────────────────

test('matchByFuzzyName returns item when all tokens appear in item.name', () => {
  const products = [
    { id: 758, name: 'LAURITA BOLSA DE HIELO ROLITO (15KG)' },
    { id: 761, name: 'LAURITA BOLSA DE HIELO ROLITO (5.5KG)' },
  ]
  assert.equal(matchByFuzzyName('laurita 5.5', products).id, 761)
  assert.equal(matchByFuzzyName('rolito 15kg', products).id, 758)
})

test('matchByFuzzyName returns null when any token is absent', () => {
  const products = [{ id: 761, name: 'LAURITA BOLSA DE HIELO ROLITO (5.5KG)' }]
  assert.equal(matchByFuzzyName('laurita pescado', products), null)
  assert.equal(matchByFuzzyName('atun rolito', products), null)
})

test('matchByFuzzyName drops tokens shorter than 2 chars', () => {
  const products = [{ id: 1, name: 'BARRA DE HIELO GRANDE' }]
  // 'a' is 1-char and gets dropped, the rest matches
  assert.equal(matchByFuzzyName('a barra grande', products).id, 1)
  // '' is still empty → should return null (no usable tokens)
  assert.equal(matchByFuzzyName('a', products), null)
})

test('matchByFuzzyName handles null/empty inputs safely', () => {
  assert.equal(matchByFuzzyName(null, [{ id: 1, name: 'X' }]), null)
  assert.equal(matchByFuzzyName('', [{ id: 1, name: 'X' }]), null)
  assert.equal(matchByFuzzyName('anything', null), null)
  assert.equal(matchByFuzzyName('anything', []), null)
})

test('matchByFuzzyName treats parens, slashes and dashes as separators', () => {
  const products = [{ id: 1, name: 'ROLITO 5.5-KG/BOLSA (LAURITA)' }]
  // Each token from the input also gets separator-split
  assert.equal(matchByFuzzyName('5.5/bolsa', products).id, 1)
  assert.equal(matchByFuzzyName('laurita(rolito)', products).id, 1)
})

test('matchByFuzzyName accepts a custom field name', () => {
  const items = [{ id: 1, title: 'Nivel de sal bajo' }]
  assert.equal(matchByFuzzyName('sal bajo', items, 'title').id, 1)
})

// ─── matchByNumericId ──────────────────────────────────────────────────────

test('matchByNumericId matches by primary field first', () => {
  const cycles = [
    { id: 15, cycle_number: 3 },
    { id: 16, cycle_number: 4 },
  ]
  assert.deepEqual(matchByNumericId(15, cycles), cycles[0])
  assert.deepEqual(matchByNumericId(16, cycles), cycles[1])
})

test('matchByNumericId falls back to altField when primary does not match', () => {
  const cycles = [{ id: 15, cycle_number: 3 }]
  // cycle_number=3 no matches id=15 directly
  assert.equal(matchByNumericId(3, cycles, 'id'), null)
  // With altField='cycle_number', 3 should match
  assert.deepEqual(matchByNumericId(3, cycles, 'id', 'cycle_number'), cycles[0])
})

test('matchByNumericId coerces string-numeric inputs', () => {
  const cycles = [{ id: 15, cycle_number: 3 }]
  assert.deepEqual(matchByNumericId('15', cycles), cycles[0])
  assert.deepEqual(matchByNumericId('3', cycles, 'id', 'cycle_number'), cycles[0])
})

test('matchByNumericId returns null for NaN or non-numeric inputs', () => {
  const cycles = [{ id: 15, cycle_number: 3 }]
  assert.equal(matchByNumericId('abc', cycles), null)
  assert.equal(matchByNumericId(NaN, cycles), null)
  assert.equal(matchByNumericId('', cycles), null)
})

test('matchByNumericId returns null for null/undefined inputs or non-array list', () => {
  const cycles = [{ id: 15 }]
  assert.equal(matchByNumericId(null, cycles), null)
  assert.equal(matchByNumericId(undefined, cycles), null)
  assert.equal(matchByNumericId(15, null), null)
  assert.equal(matchByNumericId(15, undefined), null)
  assert.equal(matchByNumericId(15, {}), null)
})

test('matchByNumericId coerces item fields that are stringified numbers', () => {
  // Covers the case where a catalog comes from JSON with stringified ids
  const items = [{ id: '15', cycle_number: '3' }]
  assert.deepEqual(matchByNumericId(15, items), items[0])
  assert.deepEqual(matchByNumericId(3, items, 'id', 'cycle_number'), items[0])
})
