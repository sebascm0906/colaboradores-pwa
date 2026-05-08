import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMyRoutePlanPath,
  normalizeRoutePlanResponse,
} from '../src/modules/ruta/routePlanAssignment.js'

test('buildMyRoutePlanPath includes dynamic assignment criteria when available', () => {
  const path = buildMyRoutePlanPath(42, {
    plan_id: 7001,
    date: '2026-05-07',
    vehicle_id: 11,
    mobile_location_id: 22,
  })

  assert.equal(
    path,
    '/pwa-ruta/my-plan?employee_id=42&plan_id=7001&date=2026-05-07&vehicle_id=11&mobile_location_id=22',
  )
})

test('buildMyRoutePlanPath accepts route_plan_id as a plan_id alias', () => {
  const path = buildMyRoutePlanPath(42, { route_plan_id: 7001 })

  assert.equal(path, '/pwa-ruta/my-plan?employee_id=42&plan_id=7001')
})

test('normalizeRoutePlanResponse preserves plan identity and assignment ids', () => {
  const plan = normalizeRoutePlanResponse({
    plan_id: 7001,
    vehicle_id: [11, 'Camioneta A'],
    mobile_location_id: [22, 'Almacen movil A'],
  })

  assert.equal(plan.id, 7001)
  assert.equal(plan.plan_id, 7001)
  assert.equal(plan.route_plan_id, 7001)
  assert.equal(plan.vehicle_id, 11)
  assert.equal(plan.mobile_location_id, 22)
})
