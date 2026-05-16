import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSupervisorOperatorSummary,
  buildTurnControlInitialOperatorSummary,
} from '../src/modules/supervision/operatorCloseSummary.js'
import { markOperatorTurnClosed } from '../src/modules/shared/operatorTurnCloseStore.js'

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
  }
}

test.beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock()
})

test.afterEach(() => {
  globalThis.localStorage = originalLocalStorage
})

test('preserves local auto-closed rolito on turno 2 when backend summary still says false', () => {
  const shift = {
    id: 701,
    warehouse_id: 76,
    date: '2026-05-14',
    shift_code: 2,
    state: 'in_progress',
    name: 'Planta Iguala - 2026-05-14 - Turno 2',
  }

  const summary = buildSupervisorOperatorSummary(shift, {
    operator_rolito_closed: false,
    operator_barra_closed: true,
    operator_barra_closed_at: '2026-05-15T02:22:00.000Z',
  })

  assert.deepEqual(summary.map((item) => ({
    role: item.role,
    closed: item.closed,
    employee_name: item.employee_name,
  })), [
    { role: 'operador_rolito', closed: true, employee_name: 'Auto-entregado' },
    { role: 'operador_barra', closed: true, employee_name: '' },
  ])
})

test('respects backend false for rolito on turno 1 when there is no local auto-close', () => {
  const shift = {
    id: 702,
    warehouse_id: 76,
    date: '2026-05-14',
    shift_code: 1,
    state: 'in_progress',
    name: 'Planta Iguala - 2026-05-14 - Turno 1',
  }

  const summary = buildSupervisorOperatorSummary(shift, {
    operator_rolito_closed: false,
    operator_barra_closed: true,
  })

  assert.deepEqual(summary.map((item) => ({
    role: item.role,
    closed: item.closed,
  })), [
    { role: 'operador_rolito', closed: false },
    { role: 'operador_barra', closed: true },
  ])
})

test('preserves local rolito close on turno 1 when backend summary is still false', () => {
  const shift = {
    id: 704,
    warehouse_id: 76,
    date: '2026-05-15',
    shift_code: 1,
    state: 'in_progress',
    name: 'Planta Iguala - 2026-05-15 - Turno 1',
  }

  markOperatorTurnClosed(shift, 'operador_rolito', {
    employee_name: 'Operador Rolito',
    closed_at: '2026-05-16T05:30:00.000Z',
  })

  const summary = buildSupervisorOperatorSummary(shift, {
    operator_rolito_closed: false,
    operator_barra_closed: true,
  })

  assert.deepEqual(summary.map((item) => ({
    role: item.role,
    closed: item.closed,
    employee_name: item.employee_name,
  })), [
    { role: 'operador_rolito', closed: true, employee_name: 'Operador Rolito' },
    { role: 'operador_barra', closed: true, employee_name: '' },
  ])
})

test('builds initial operator summary for turn control without backend summary', () => {
  const shift = {
    id: 703,
    warehouse_id: 76,
    date: '2026-05-14',
    shift_code: 2,
    state: 'in_progress',
    name: 'Planta Iguala - 2026-05-14 - Turno 2',
  }

  const summary = buildTurnControlInitialOperatorSummary(shift)

  assert.deepEqual(summary.map((item) => ({
    role: item.role,
    closed: item.closed,
  })), [
    { role: 'operador_rolito', closed: true },
    { role: 'operador_barra', closed: false },
  ])
})
