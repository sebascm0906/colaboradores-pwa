import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSupervisorDashboardFallback } from '../src/modules/supervisor-ventas/dashboardVentasState.js'

test('buildSupervisorDashboardFallback derives summary cards from day overview', () => {
  const summary = buildSupervisorDashboardFallback({
    avg_compliance: 73,
    done_stops: 22,
    total_stops: 30,
    total_sales_actual: 22000,
    total_sales_target: 30000,
    vendors_critical: 1,
    vendors_warning: 2,
    vendors_good: 2,
    departed: 4,
    not_departed: 1,
    liquidated: 1,
    pending_liquidation: 2,
    closed: 3,
    with_route: 5,
  })

  assert.equal(summary.hero.value, '73%')
  assert.equal(summary.hero.label, 'Cumplimiento del dia')
  assert.equal(summary.cards[0].value, '22/30')
  assert.equal(summary.cards[1].value, '$22K')
  assert.equal(summary.cards[2].value, '4/5')
  assert.equal(summary.cards[3].value, '1')
  assert.equal(summary.breakdown[0].value, '1')
  assert.equal(summary.breakdown[1].value, '2')
  assert.equal(summary.breakdown[2].value, '2')
  assert.equal(summary.footer, '3 cerrados · 2 pendientes por liquidar')
})
