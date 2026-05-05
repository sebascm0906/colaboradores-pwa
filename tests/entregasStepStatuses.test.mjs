import assert from 'node:assert/strict'
import { test } from 'node:test'

import { computeStepStatuses, STEP_STATUS } from '../src/modules/entregas/entregasService.js'

test('cargar unidades remains available when CIGU has no planned routes', () => {
  const statuses = computeStepStatuses({
    shift_handover_pending: false,
    shift_accepted_today: false,
    pending_pallets: 0,
    routes_total: 0,
    routes_pending: 0,
    pending_returns: 0,
    scraps_today: 0,
  })

  assert.equal(statuses.cargarUnidades, STEP_STATUS.PENDING)
})
