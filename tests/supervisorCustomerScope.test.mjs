import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSupervisorCustomerDomains,
  resolveSupervisorCustomerAnalyticUnitId,
} from '../src/modules/supervisor-ventas/customerScope.js'

test('resolveSupervisorCustomerAnalyticUnitId prefers session analytic account', () => {
  assert.equal(resolveSupervisorCustomerAnalyticUnitId({
    sessionAnalyticAccountId: 89,
    employeeAnalyticAccountId: 44,
    fallbackAnalyticUnitId: 12,
  }), 89)
})

test('resolveSupervisorCustomerAnalyticUnitId falls back to employee then fallback id', () => {
  assert.equal(resolveSupervisorCustomerAnalyticUnitId({
    sessionAnalyticAccountId: 0,
    employeeAnalyticAccountId: 44,
    fallbackAnalyticUnitId: 12,
  }), 44)

  assert.equal(resolveSupervisorCustomerAnalyticUnitId({
    sessionAnalyticAccountId: 0,
    employeeAnalyticAccountId: 0,
    fallbackAnalyticUnitId: 12,
  }), 12)
})

test('buildSupervisorCustomerDomains filters only by active and x_analytic_un_id', () => {
  assert.deepEqual(buildSupervisorCustomerDomains(77), [
    ['active', '=', true],
    ['x_analytic_un_id', '=', 77],
  ])

  assert.deepEqual(buildSupervisorCustomerDomains(0), [['id', '=', 0]])
})
