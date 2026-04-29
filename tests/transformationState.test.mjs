import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeTransformationUiState } from '../src/modules/transformaciones/utils/transformationState.js'

test('normalizeTransformationUiState maps cancelled transformations to a Cancelada primary badge', () => {
  const state = normalizeTransformationUiState({
    state: 'cancelled',
  })

  assert.deepEqual(state.primary, {
    key: 'cancelled',
    label: 'Cancelada',
    tone: 'error',
  })
  assert.equal(state.secondary, null)
})

test('normalizeTransformationUiState maps confirmed transformations to a Confirmada primary badge', () => {
  const state = normalizeTransformationUiState({
    state: 'confirmed',
  })

  assert.deepEqual(state.primary, {
    key: 'confirmed',
    label: 'Confirmada',
    tone: 'success',
  })
})

test('normalizeTransformationUiState falls back to Pendiente for unknown or empty states', () => {
  assert.deepEqual(
    normalizeTransformationUiState({ state: '' }).primary,
    { key: 'pending', label: 'Pendiente', tone: 'warning' },
  )

  assert.deepEqual(
    normalizeTransformationUiState({ state: 'mystery_state' }).primary,
    { key: 'pending', label: 'Pendiente', tone: 'warning' },
  )
})

test('normalizeTransformationUiState exposes a secondary Con variacion badge when irregularity is present', () => {
  const state = normalizeTransformationUiState({
    state: 'done',
    irregularity_flag: true,
  })

  assert.deepEqual(state.primary, {
    key: 'confirmed',
    label: 'Confirmada',
    tone: 'success',
  })
  assert.deepEqual(state.secondary, {
    key: 'variance',
    label: 'Con variacion',
    tone: 'warning',
  })
})

test('normalizeTransformationUiState treats cancel_reason as cancelled even without explicit backend state', () => {
  const state = normalizeTransformationUiState({
    state: 'done',
    cancel_reason: 'captura duplicada',
  })

  assert.deepEqual(state.primary, {
    key: 'cancelled',
    label: 'Cancelada',
    tone: 'error',
  })
})
