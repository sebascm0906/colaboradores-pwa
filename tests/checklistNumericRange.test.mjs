import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeChecklistNumericRange,
  normalizeChecklistNumericCheck,
} from '../src/modules/produccion/checklistNumericRange.js'

test('normalizeChecklistNumericRange keeps already ordered bounds untouched', () => {
  assert.deepEqual(
    normalizeChecklistNumericRange({ min_value: -18, max_value: 0 }),
    { min_value: -18, max_value: 0, wasInverted: false },
  )
})

test('normalizeChecklistNumericRange swaps inverted bounds', () => {
  assert.deepEqual(
    normalizeChecklistNumericRange({ min_value: 0, max_value: -18 }),
    { min_value: -18, max_value: 0, wasInverted: true },
  )
})

test('normalizeChecklistNumericCheck only changes numeric checks with inverted bounds', () => {
  assert.deepEqual(
    normalizeChecklistNumericCheck({
      id: 11,
      check_type: 'numeric',
      min_value: 0,
      max_value: -18,
      name: 'Temperatura camara PT',
    }),
    {
      id: 11,
      check_type: 'numeric',
      min_value: -18,
      max_value: 0,
      name: 'Temperatura camara PT',
      _range_was_inverted: true,
    },
  )
})

test('normalizeChecklistNumericCheck leaves non-numeric checks unchanged', () => {
  assert.deepEqual(
    normalizeChecklistNumericCheck({
      id: 12,
      check_type: 'yes_no',
      min_value: 0,
      max_value: -18,
    }),
    {
      id: 12,
      check_type: 'yes_no',
      min_value: 0,
      max_value: -18,
    },
  )
})
