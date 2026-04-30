import test from 'node:test'
import assert from 'node:assert/strict'

import {
  areRequiredOperatorClosesDone,
  clearStaleOperatorTurnClosed,
  clearOperatorTurnClosed,
  getOperatorCloseRecord,
  getOperatorCloseState,
  getOperatorCloseSummary,
  isOperatorTurnClosed,
  markOperatorTurnClosed,
  reopenOperatorTurnClosed,
} from '../src/modules/shared/operatorTurnCloseStore.js'

const originalLocalStorage = globalThis.localStorage

function createLocalStorageMock() {
  let store = {}
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key, value) {
      store[key] = String(value)
    },
    removeItem(key) {
      delete store[key]
    },
    clear() {
      store = {}
    },
    key(index) {
      return Object.keys(store)[index] || null
    },
    get length() {
      return Object.keys(store).length
    },
  }
}

test.beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock()
})

test.afterEach(() => {
  globalThis.localStorage = originalLocalStorage
})

test('operator turn close store keeps compatibility and stores close metadata per role', () => {
  assert.equal(markOperatorTurnClosed(101, 'rolito', {
    employee_name: 'Ana',
    closed_at: '2026-04-22T10:15:00.000Z',
    shift_state: 'in_progress',
    shift_name: 'Turno Matutino',
    shift_date: '2026-04-22',
    shift_code: 1,
  }), true)

  const record = getOperatorCloseRecord(101, 'operador_rolito')
  assert.deepEqual(record, {
    role: 'operador_rolito',
    label: 'Operador Rolito',
    closed: true,
    closed_at: '2026-04-22T10:15:00.000Z',
    employee_name: 'Ana',
    shift_id: '101',
    shift_state: 'in_progress',
    shift_name: 'Turno Matutino',
    shift_date: '2026-04-22',
    shift_code: 1,
  })

  const summary = getOperatorCloseSummary(101)
  assert.equal(summary.length, 2)
  assert.equal(summary[0].role, 'operador_rolito')
  assert.equal(summary[0].closed, true)
  assert.equal(isOperatorTurnClosed(101, 'operador_rolito'), true)
  assert.equal(areRequiredOperatorClosesDone(101), false)
})

test('reopenOperatorTurnClosed only clears the matching role when the current shift still matches', () => {
  markOperatorTurnClosed(202, 'operador_rolito', { employee_name: 'Ana' })
  markOperatorTurnClosed(202, 'operador_barra', { employee_name: 'Luis' })

  assert.equal(reopenOperatorTurnClosed(202, 'operador_rolito', {
    currentShift: { id: 202, state: 'in_progress' },
  }), true)

  assert.equal(isOperatorTurnClosed(202, 'operador_rolito'), false)
  assert.equal(isOperatorTurnClosed(202, 'operador_barra'), true)
  assert.equal(areRequiredOperatorClosesDone(202), false)
})

test('getOperatorCloseState and reopenOperatorTurnClosed reject stale master shifts', () => {
  markOperatorTurnClosed(303, 'operador_barra', { employee_name: 'Luis' })

  const sameShift = getOperatorCloseState(303, 'operador_barra', {
    id: 303,
    state: 'in_progress',
  })
  assert.equal(sameShift.closed, true)
  assert.equal(sameShift.matches_current_shift, true)
  assert.equal(sameShift.can_reopen, true)

  const staleShift = getOperatorCloseState(303, 'operador_barra', {
    id: 404,
    state: 'in_progress',
  })
  assert.equal(staleShift.closed, true)
  assert.equal(staleShift.matches_current_shift, false)
  assert.equal(staleShift.stale, true)
  assert.equal(staleShift.can_reopen, false)

  assert.equal(reopenOperatorTurnClosed(303, 'operador_barra', {
    currentShift: { id: 404, state: 'in_progress' },
  }), false)
  assert.equal(reopenOperatorTurnClosed(303, 'operador_barra', {
    currentShift: { id: 303, state: 'closed' },
  }), false)
  assert.equal(isOperatorTurnClosed(303, 'operador_barra'), true)
})

test('clearStaleOperatorTurnClosed resets a closed subturn when a new shift reuses the same scope', () => {
  const previousShift = {
    id: 501,
    warehouse_id: 1172,
    date: '2026-04-30',
    shift_code: 1,
    state: 'in_progress',
  }
  const currentShift = {
    id: 502,
    warehouse_id: 1172,
    date: '2026-04-30',
    shift_code: 1,
    state: 'in_progress',
  }

  assert.equal(markOperatorTurnClosed(previousShift, 'operador_rolito', {
    employee_name: 'Ana',
  }), true)

  const staleState = getOperatorCloseState(currentShift, 'operador_rolito', currentShift)
  assert.equal(staleState.closed, true)
  assert.equal(staleState.stale, true)
  assert.equal(staleState.effectively_closed, false)

  assert.equal(clearStaleOperatorTurnClosed(currentShift, 'operador_rolito', currentShift), true)

  const nextState = getOperatorCloseState(currentShift, 'operador_rolito', currentShift)
  assert.equal(nextState.closed, false)
  assert.equal(nextState.stale, false)
  assert.equal(nextState.effectively_closed, false)
})

test('clearOperatorTurnClosed removes the full shift entry', () => {
  markOperatorTurnClosed(404, 'operador_barra', { employee_name: 'Luis' })
  clearOperatorTurnClosed(404)

  assert.equal(isOperatorTurnClosed(404, 'operador_barra'), false)
  assert.deepEqual(getOperatorCloseSummary(404).map((item) => item.closed), [false, false])
})
