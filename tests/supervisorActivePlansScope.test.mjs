import test from 'node:test'
import assert from 'node:assert/strict'

import { filterActiveRoutePlansByScope } from '../src/modules/supervisor-ventas/routePlanning.js'

test('filterActiveRoutePlansByScope keeps only plans assigned to scoped team vendors', () => {
  const plans = [
    { id: 1, route_id: 101, driver_id: 10, driver_name: 'Chofer Iguala #5', route_name: 'Chofer Iguala #5' },
    { id: 2, route_id: 102, driver_id: 11, driver_name: 'ESTEBAN ALEMAN SERRADO', route_name: 'ESTEBAN ALEMAN SERRADO' },
    { id: 3, route_id: 999, driver_id: 55, driver_name: 'CESAR ALEXANDER AVIÑA DIAZ', route_name: 'CESAR ALEXANDER AVIÑA DIAZ' },
  ]
  const scopedVendors = [
    { id: 10, route_id: 101, name: 'Chofer Iguala #5' },
    { id: 11, route_id: 102, name: 'ESTEBAN ALEMAN SERRADO' },
  ]

  const filtered = filterActiveRoutePlansByScope(plans, scopedVendors)

  assert.deepEqual(filtered.map((plan) => plan.id), [1, 2])
})

test('filterActiveRoutePlansByScope falls back to route ids when driver id is missing', () => {
  const plans = [
    { id: 20, route_id: 220, driver_id: 0, driver_name: '', route_name: 'Chofer Iguala #5' },
    { id: 21, route_id: 221, driver_id: 0, driver_name: '', route_name: 'Fuera de scope' },
  ]
  const scopedVendors = [
    { id: 10, route_id: 220, name: 'Chofer Iguala #5' },
  ]

  const filtered = filterActiveRoutePlansByScope(plans, scopedVendors)

  assert.deepEqual(filtered.map((plan) => plan.id), [20])
})
