import assert from 'node:assert/strict'
import { test } from 'node:test'

import { calculateFlowState } from '../src/modules/ruta/routeFlowState.js'

test('allows route inventory and corte before all stops are completed', () => {
  const { steps } = calculateFlowState({
    state: 'in_progress',
    load_sealed: true,
    stops_done: 2,
    stops_total: 18,
  })

  const byId = Object.fromEntries(steps.map(step => [step.id, step]))

  assert.equal(byId.control.status, 'active')
  assert.equal(byId.inventario.status, 'active')
  assert.equal(byId.corte.status, 'active')
  assert.equal(byId.liquidacion.status, 'pending')
})
