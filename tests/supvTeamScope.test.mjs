import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectRouteEmployeeIds, SUPV_ROUTE_EMPLOYEE_FIELDS } from '../src/modules/supervisor-ventas/teamScope.js'

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
