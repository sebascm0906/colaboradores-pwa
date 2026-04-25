import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeReceiptState,
  resolveReceiptActionLabel,
  clampReceiveQty,
  buildReceivePayloadLines,
  normalizeReceiptSummary,
  buildEditableReceiptLines,
  computeReceivableTotals,
  resolveReceiptBadge,
  shouldShowReceiptAction,
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

test('buildEditableReceiptLines derives pending quantities per move line', () => {
  const lines = buildEditableReceiptLines([
    { move_id: 10, qty_ordered: 12, qty_received: 5, qty_pending: 7 },
  ])

  assert.equal(lines[0].move_id, 10)
  assert.equal(lines[0].qty_pending, 7)
  assert.equal(lines[0].receive_now_qty, 7)
})

test('computeReceivableTotals sums only positive edited quantities', () => {
  assert.deepEqual(
    computeReceivableTotals([{ receive_now_qty: 0 }, { receive_now_qty: 4 }]),
    { line_count: 1, qty_total: 4 },
  )
})

test('resolveReceiptBadge returns received badge metadata for completed receptions', () => {
  const badge = resolveReceiptBadge({ receipt_state: 'received' })

  assert.equal(badge.label, 'Recibido')
  assert.equal(badge.tone, 'success')
})

test('shouldShowReceiptAction hides receive CTA once requisition is fully received', () => {
  assert.equal(
    shouldShowReceiptAction({ receipt_state: 'received', can_receive: false }),
    false,
  )
})
