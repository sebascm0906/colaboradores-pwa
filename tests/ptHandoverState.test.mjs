import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizePendingPtHandover,
  derivePtBlockState,
  translatePtBlockedError,
} from '../src/modules/almacen-pt/ptHandoverState.js'

test('normalizePendingPtHandover marks supervisor-close handover as required and blocking', () => {
  const handover = normalizePendingPtHandover({
    id: 55,
    source_shift_id: 91,
    required_after_supervisor_close: true,
    warehouse_blocked: true,
    count_submitted: false,
  })

  assert.equal(handover.id, 55)
  assert.equal(handover.required_after_supervisor_close, true)
  assert.equal(handover.warehouse_blocked, true)
  assert.equal(handover.count_submitted, false)
})

test('derivePtBlockState prefers explicit backend block flags', () => {
  const state = derivePtBlockState({
    summary: { pt_blocked_by_handover: true, shift_handover_pending: true },
    handover: { id: 55, warehouse_blocked: true },
  })

  assert.equal(state.blocked, true)
  assert.equal(state.reason, 'handover_pending')
})

test('translatePtBlockedError returns operator-safe copy for semantic backend code', () => {
  assert.equal(
    translatePtBlockedError('PT_BLOCKED_BY_HANDOVER'),
    'PT cerrado por relevo pendiente. Acepta el turno para continuar.'
  )
})

test('derivePtBlockState preserves the explicit backend block reason', () => {
  const state = derivePtBlockState({
    summary: {
      pt_blocked_by_handover: true,
      pt_block_reason: 'supervisor_close_handover',
      shift_handover_pending: true,
    },
    handover: null,
  })

  assert.equal(state.blocked, true)
  assert.equal(state.reason, 'supervisor_close_handover')
})
