import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeReceiptState,
  resolveReceiptActionLabel,
  clampReceiveQty,
  buildReceivePayloadLines,
  normalizeReceiptSummary,
} from '../src/modules/admin/requisitionReceiptState.js'

test('normalizeReceiptState maps partially_received to green/yellow UI metadata', () => {
  const state = normalizeReceiptState('partially_received')

  assert.equal(state.key, 'partially_received')
  assert.equal(state.label, 'Parcialmente recibido')
  assert.equal(state.canReceive, true)
})

test('resolveReceiptActionLabel returns continuar for partial receptions', () => {
  assert.equal(
    resolveReceiptActionLabel({ receipt_state: 'partially_received', can_receive: true }),
    'Continuar recepción',
  )
})

test('clampReceiveQty never exceeds pending qty', () => {
  assert.equal(clampReceiveQty(12, 5), 5)
})

test('buildReceivePayloadLines skips zero quantities', () => {
  assert.deepEqual(
    buildReceivePayloadLines([
      { move_id: 10, receive_now_qty: 0 },
      { move_id: 11, receive_now_qty: 3 },
    ]),
    [{ move_id: 11, receive_now_qty: 3 }],
  )
})

test('normalizeReceiptSummary falls back to confirmed with zero totals when backend fields are absent', () => {
  assert.deepEqual(
    normalizeReceiptSummary({ state: 'purchase' }),
    {
      receipt_state: 'confirmed',
      qty_received_total: 0,
      qty_pending_total: 0,
      can_receive: false,
      incoming_picking_id: 0,
    },
  )
})
