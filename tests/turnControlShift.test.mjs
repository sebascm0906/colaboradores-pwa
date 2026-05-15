import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveSupervisionShift,
  resolveTurnControlShift,
} from '../src/modules/supervision/turnControlShift.js'

test('uses fetched active shift when available', () => {
  const fetchedShift = { id: 801, state: 'in_progress', name: 'Turno 2' }
  const navigatedShift = { id: 800, state: 'in_progress', name: 'Turno anterior' }

  const resolved = resolveTurnControlShift(fetchedShift, navigatedShift)

  assert.equal(resolved, fetchedShift)
})

test('falls back to navigated active shift when fetch returns null', () => {
  const navigatedShift = { id: 802, state: 'in_progress', name: 'Planta Iguala - 2026-05-14 - Turno 2' }

  const resolved = resolveTurnControlShift(null, navigatedShift)

  assert.equal(resolved, navigatedShift)
})

test('does not use navigated shift if it is already closed', () => {
  const navigatedShift = { id: 803, state: 'closed', name: 'Turno cerrado' }

  const resolved = resolveTurnControlShift(null, navigatedShift)

  assert.equal(resolved, null)
})

test('falls back to persisted active shift when fetch and navigation state are missing', () => {
  const persistedShift = { id: 804, state: 'in_progress', name: 'Turno persistido' }

  const resolved = resolveTurnControlShift(null, null, persistedShift)

  assert.equal(resolved, persistedShift)
})

test('supervision hub only uses fallback shift when explicitly allowed', () => {
  const fallbackShift = { id: 805, state: 'draft', name: 'Turno borrador reciente' }

  assert.equal(resolveSupervisionShift(null, fallbackShift, false), null)
  assert.equal(resolveSupervisionShift(null, fallbackShift, true), fallbackShift)
})
