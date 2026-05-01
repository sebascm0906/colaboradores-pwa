import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getTomorrowDateString,
  getRoutePlanningState,
  normalizeRoutePlanningRow,
  buildRouteForecastPayload,
} from '../src/modules/supervisor-ventas/routePlanning.js'

test('getTomorrowDateString returns local YYYY-MM-DD for the next day', () => {
  const base = new Date(2026, 4, 1, 10, 30, 0)
  assert.equal(getTomorrowDateString(base), '2026-05-02')
})

test('getRoutePlanningState maps route lifecycle to card states', () => {
  assert.equal(getRoutePlanningState({ plan_id: 0 }), 'sin_plan')
  assert.equal(getRoutePlanningState({ plan_id: 10, forecast_state: 'draft' }), 'plan_draft')
  assert.equal(getRoutePlanningState({ plan_id: 10, forecast_state: 'confirmed' }), 'forecast_confirmed')
  assert.equal(getRoutePlanningState({ plan_id: 10, load_picking_id: 55 }), 'load_ready')
  assert.equal(getRoutePlanningState({ plan_id: 10, load_picking_id: 55, load_sealed: true }), 'load_executed')
  assert.equal(getRoutePlanningState({ blocked: true }), 'blocked')
})

test('normalizeRoutePlanningRow preserves route and employee fields', () => {
  assert.deepEqual(normalizeRoutePlanningRow({
    route_id: 7,
    route_name: 'Ruta 07',
    employee_id: [123, 'Aida'],
    plan_id: [44, 'Plan'],
    load_picking_id: false,
    load_sealed: false,
    date_target: '2026-05-02',
  }), {
    route_id: 7,
    route_name: 'Ruta 07',
    employee_id: 123,
    employee_name: 'Aida',
    plan_id: 44,
    plan_state: '',
    forecast_id: 0,
    forecast_state: '',
    load_picking_id: 0,
    load_sealed: false,
    date_target: '2026-05-02',
    state: 'plan_draft',
    blocked: false,
    block_reason: '',
  })
})

test('buildRouteForecastPayload filters invalid lines and includes route context', () => {
  assert.deepEqual(buildRouteForecastPayload({
    routeId: 7,
    planId: 44,
    dateTarget: '2026-05-02',
    lines: [
      { product_id: '10', channel: 'Van', qty: '3' },
      { product_id: '', channel: 'Van', qty: '5' },
      { product_id: '11', channel: 'Mostrador', qty: '0' },
    ],
  }), {
    route_id: 7,
    route_plan_id: 44,
    date_target: '2026-05-02',
    lines: [{ product_id: 10, channel: 'Van', qty: 3 }],
  })
})
