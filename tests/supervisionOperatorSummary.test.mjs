import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSupervisorOperatorSummary,
  buildTurnControlInitialOperatorSummary,
} from '../src/modules/supervision/operatorCloseSummary.js'

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
