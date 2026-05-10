import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getTomorrowDateString,
  getPlanningDateBounds,
  isFuturePlanningDate,
  getRoutePlanningState,
  normalizeRoutePlanningRow,
  buildRouteForecastPayload,
  buildRoutePlanCriteriaPayload,
  getDefaultTimeWindow,
  normalizeActiveRoutePlan,
  normalizeCustomerSearchResult,
  getSupervisorRouteErrorMessage,
  buildPolygonMarkerStyle,
  DEMAND_CLASSES,
  sanitizeDemandClasses,
  getDemandClassesSummary,
} from '../src/modules/supervisor-ventas/routePlanning.js'

test('getTomorrowDateString returns local YYYY-MM-DD for the next day', () => {
  const base = new Date(2026, 4, 1, 10, 30, 0)
  assert.equal(getTomorrowDateString(base), '2026-05-02')
})

test('planning date bounds default to tomorrow and allow later future dates', () => {
  const base = new Date(2026, 4, 1, 10, 30, 0)
  assert.deepEqual(getPlanningDateBounds(base), {
    defaultDate: '2026-05-02',
    minDate: '2026-05-02',
  })
  assert.equal(isFuturePlanningDate('2026-05-01', base), false)
  assert.equal(isFuturePlanningDate('2026-05-02', base), true)
  assert.equal(isFuturePlanningDate('2026-05-15', base), true)
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
    demand_classes: [],
  })
})

// ── F1: demand_classes ──────────────────────────────────────────────────────
test('DEMAND_CLASSES constant exposes the canonical AA → C order', () => {
  assert.deepEqual(DEMAND_CLASSES, ['AA', 'A', 'B', 'C'])
})

test('sanitizeDemandClasses keeps only valid classes in canonical order', () => {
  assert.deepEqual(sanitizeDemandClasses([]), [])
  assert.deepEqual(sanitizeDemandClasses(null), [])
  assert.deepEqual(sanitizeDemandClasses(undefined), [])
  assert.deepEqual(sanitizeDemandClasses(['A', 'AA']), ['AA', 'A'])
  // Ignora valores invalidos y normaliza casing.
  assert.deepEqual(sanitizeDemandClasses(['aa', 'a', 'b', 'c', 'D', 'Z', '']), ['AA', 'A', 'B', 'C'])
  // Sin duplicados.
  assert.deepEqual(sanitizeDemandClasses(['AA', 'AA', 'a']), ['AA', 'A'])
})

test('getDemandClassesSummary humaniza la seleccion para la UI', () => {
  assert.equal(getDemandClassesSummary([]), 'Todas')
  assert.equal(getDemandClassesSummary(null), 'Todas')
  assert.equal(getDemandClassesSummary(['AA']), 'AA')
  assert.equal(getDemandClassesSummary(['AA', 'A']), 'AA/A')
  assert.equal(getDemandClassesSummary(['c', 'b', 'a', 'aa']), 'AA/A/B/C')
})

test('buildRoutePlanCriteriaPayload includes sanitized demand_classes (todas)', () => {
  // Caso "todas": payload contiene demand_classes: [] (no se omite).
  assert.deepEqual(buildRoutePlanCriteriaPayload({
    routeId: 10,
    dateTarget: '2026-05-10',
    polygonId: 20,
    channelIds: [],
    visitDays: [],
    timeWindowId: '',
  }).demand_classes, [])
})

test('buildRoutePlanCriteriaPayload includes demand_classes ["AA","A"]', () => {
  assert.deepEqual(buildRoutePlanCriteriaPayload({
    routeId: 10,
    dateTarget: '2026-05-10',
    polygonId: 20,
    channelIds: [],
    visitDays: [],
    timeWindowId: '',
    demandClasses: ['A', 'AA'],
  }).demand_classes, ['AA', 'A'])
})

test('buildRoutePlanCriteriaPayload includes demand_classes ["B","C"]', () => {
  assert.deepEqual(buildRoutePlanCriteriaPayload({
    routeId: 10,
    dateTarget: '2026-05-10',
    polygonId: 20,
    channelIds: [],
    visitDays: [],
    timeWindowId: '',
    demandClasses: ['B', 'C'],
  }).demand_classes, ['B', 'C'])
})

test('buildRoutePlanCriteriaPayload descarta clases invalidas (defensa cliente)', () => {
  // El backend tambien valida y devuelve VALIDATION_ERROR; este es la red de
  // seguridad cliente para que la UI nunca envie basura.
  assert.deepEqual(buildRoutePlanCriteriaPayload({
    routeId: 10,
    dateTarget: '2026-05-10',
    polygonId: 20,
    channelIds: [],
    visitDays: [],
    timeWindowId: '',
    demandClasses: ['AA', 'Z', 99, '', null],
  }).demand_classes, ['AA'])
})

test('getSupervisorRouteErrorMessage mapea VALIDATION_ERROR de demand_classes', () => {
  assert.match(getSupervisorRouteErrorMessage({ code: 'demand_class_invalid' }), /AA, A, B o C/)
  assert.match(getSupervisorRouteErrorMessage({ code: 'demand_classes_invalid' }), /AA, A, B o C/)
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
