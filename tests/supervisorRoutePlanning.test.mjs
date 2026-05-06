import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getTomorrowDateString,
  getRoutePlanningState,
  normalizeRoutePlanningRow,
  buildRouteForecastPayload,
  buildRoutePlanCriteriaPayload,
  getDefaultTimeWindow,
  normalizeActiveRoutePlan,
  normalizeCustomerSearchResult,
  getSupervisorRouteErrorMessage,
  buildPolygonMarkerStyle,
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

test('buildRoutePlanCriteriaPayload defaults to any time and all visit days', () => {
  assert.deepEqual(buildRoutePlanCriteriaPayload({
    routeId: '10',
    dateTarget: '2026-05-06',
    polygonId: '20',
    subpolygonId: '',
    channelIds: ['1', '2'],
    visitDays: [],
    timeWindowId: '',
  }), {
    route_id: 10,
    date_target: '2026-05-06',
    polygon_id: 20,
    subpolygon_id: null,
    channel_ids: [1, 2],
    visit_days: [],
    time_window_id: null,
  })
})

test('getDefaultTimeWindow returns any time semantics', () => {
  assert.deepEqual(getDefaultTimeWindow(), {
    id: null,
    key: 'any',
    label: 'Cualquier hora',
  })
})

test('normalizeActiveRoutePlan maps backend plan fields for manual customer insertion', () => {
  assert.deepEqual(normalizeActiveRoutePlan({
    id: 100,
    name: 'Ruta Centro',
    route_id: [10, 'Centro'],
    driver_employee_id: [7, 'Luis'],
    state: 'in_progress',
    stops_total: 12,
  }), {
    id: 100,
    name: 'Ruta Centro',
    route_id: 10,
    route_name: 'Centro',
    driver_id: 7,
    driver_name: 'Luis',
    state: 'in_progress',
    stops_total: 12,
  })
})

test('normalizeCustomerSearchResult keeps customer planning fields', () => {
  assert.deepEqual(normalizeCustomerSearchResult({
    id: 55,
    name: 'Abarrotes Sol',
    street: 'Av 1',
    channel_ids: [[1, 'Mayoreo']],
    visit_days: ['monday'],
    time_window_id: [3, 'Tarde'],
    latitude: 20.1,
    longitude: -103.1,
  }), {
    id: 55,
    name: 'Abarrotes Sol',
    address: 'Av 1',
    channels: ['Mayoreo'],
    visit_days: ['monday'],
    time_window: 'Tarde',
    latitude: 20.1,
    longitude: -103.1,
  })
})

test('getSupervisorRouteErrorMessage maps backend functional errors', () => {
  assert.match(getSupervisorRouteErrorMessage({ code: 'polygon_not_found' }), /poligono/i)
  assert.match(getSupervisorRouteErrorMessage({ code: 'customer_already_in_plan' }), /ya esta/i)
})

test('buildPolygonMarkerStyle uses polygon color and black for unassigned customers', () => {
  assert.deepEqual(buildPolygonMarkerStyle({ polygonColor: '#2f80ed', subpolygonLetter: 'A' }), {
    background: '#2f80ed',
    color: '#ffffff',
    label: 'A',
    size: 18,
  })
  assert.deepEqual(buildPolygonMarkerStyle({ hasPolygon: false }), {
    background: '#000000',
    color: '#ffffff',
    label: '',
    size: 18,
  })
})
