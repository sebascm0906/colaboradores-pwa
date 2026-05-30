import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  collectRouteEmployeeIds,
  filterRouteSuggestionsByDriverScope,
  filterRoutesByEmployeeScope,
  SUPV_ROUTE_EMPLOYEE_FIELDS,
} from '../src/modules/supervisor-ventas/teamScope.js'

test('supervisor route scope includes assistant employees assigned to CEDIS routes', () => {
  const ids = collectRouteEmployeeIds([
    {
      driver_employee_id: [684, 'ESTEVAN VALERIO GUZMAN'],
      assistant_employee_id: [723, 'Bernardo Tlatempa'],
      salesperson_employee_id: [684, 'ESTEVAN VALERIO GUZMAN'],
    },
  ])

  assert.deepEqual(ids, [684, 723])
})

test('supervisor route employee field list includes assistant_employee_id', () => {
  assert.ok(SUPV_ROUTE_EMPLOYEE_FIELDS.includes('assistant_employee_id'))
})

test('filterRoutesByEmployeeScope keeps only routes with employees in analytic scope', () => {
  const rows = filterRoutesByEmployeeScope([
    { id: 1, salesperson_employee_id: [10, 'Chofer Iguala'] },
    { id: 2, driver_employee_id: [20, 'Chofer Taxco'] },
    { id: 3, assistant_employee_id: [30, 'Aux Iguala'] },
  ], [10, 30])

  assert.deepEqual(rows.map((row) => row.id), [1, 3])
})

test('filterRouteSuggestionsByDriverScope removes driver options outside analytic scope', () => {
  const suggestions = filterRouteSuggestionsByDriverScope([
    {
      weekly_plan_line_id: 1,
      valid_route_options: [
        { driver_employee_id: 10, driver_name: 'Chofer Iguala', vehicle_id: 100 },
        { driver_employee_id: 20, driver_name: 'Chofer Taxco', vehicle_id: 200 },
      ],
    },
    {
      weekly_plan_line_id: 2,
      valid_route_options: [
        { driver_id: 20, driver_name: 'Chofer Taxco', vehicle_id: 300 },
      ],
    },
    {
      weekly_plan_line_id: 3,
      route_resolution_status: 'resolved',
      valid_route_options: [],
    },
  ], [10])

  assert.deepEqual(suggestions, [
    {
      weekly_plan_line_id: 1,
      valid_route_options: [
        { driver_employee_id: 10, driver_name: 'Chofer Iguala', vehicle_id: 100 },
      ],
    },
    {
      weekly_plan_line_id: 3,
      route_resolution_status: 'resolved',
      valid_route_options: [],
    },
  ])
})
