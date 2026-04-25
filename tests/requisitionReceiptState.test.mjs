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

// ── normalizeReceiptState ─────────────────────────────────────────────────────

test('normalizeReceiptState maps partially_received to warning canReceive metadata', () => {
  const s = normalizeReceiptState('partially_received')
  assert.equal(s.key, 'partially_received')
  assert.equal(s.label, 'Parcialmente recibido')
  assert.equal(s.tone, 'warning')
  assert.equal(s.canReceive, true)
})

test('normalizeReceiptState returns muted none for unknown value', () => {
  const s = normalizeReceiptState('unknown')
  assert.equal(s.key, 'none')
  assert.equal(s.canReceive, false)
})

test('normalizeReceiptState maps received to success non-receivable', () => {
  const s = normalizeReceiptState('received')
  assert.equal(s.tone, 'success')
  assert.equal(s.canReceive, false)
})

// ── resolveReceiptActionLabel ─────────────────────────────────────────────────

test('resolveReceiptActionLabel returns Continuar recepción for partial receptions', () => {
  assert.equal(
    resolveReceiptActionLabel({ receipt_state: 'partially_received', can_receive: true }),
    'Continuar recepción',
  )
})

test('resolveReceiptActionLabel returns Recibir producto for confirmed', () => {
  assert.equal(
    resolveReceiptActionLabel({ receipt_state: 'confirmed', can_receive: true }),
    'Recibir producto',
  )
})

test('resolveReceiptActionLabel returns empty string when can_receive is false', () => {
  assert.equal(resolveReceiptActionLabel({ receipt_state: 'confirmed', can_receive: false }), '')
})

// ── clampReceiveQty ───────────────────────────────────────────────────────────

test('clampReceiveQty never exceeds pending qty', () => {
  assert.equal(clampReceiveQty(12, 5), 5)
})

test('clampReceiveQty allows less than pending qty', () => {
  assert.equal(clampReceiveQty(3, 5), 3)
})

// ── buildReceivePayloadLines ──────────────────────────────────────────────────

test('buildReceivePayloadLines skips zero quantities', () => {
  assert.deepEqual(
    buildReceivePayloadLines([
      { move_id: 10, receive_now_qty: 0 },
      { move_id: 11, receive_now_qty: 3 },
    ]),
    [{ move_id: 11, receive_now_qty: 3 }],
  )
})

// ── normalizeReceiptSummary ───────────────────────────────────────────────────

test('normalizeReceiptSummary falls back to confirmed + can_receive=true when backend fields are absent', () => {
  assert.deepEqual(
    normalizeReceiptSummary({ state: 'purchase' }),
    {
      receipt_state: 'confirmed',
      qty_received_total: 0,
      qty_pending_total: 0,
      can_receive: true,   // inferred from confirmed state — button must show even without backend field
      incoming_picking_id: 0,
    },
  )
})

test('normalizeReceiptSummary preserves backend receipt_state when present', () => {
  const r = normalizeReceiptSummary({
    state: 'purchase',
    receipt_state: 'partially_received',
    qty_received_total: 10,
    qty_pending_total: 5,
    can_receive: true,
    incoming_picking_id: 42,
  })
  assert.equal(r.receipt_state, 'partially_received')
  assert.equal(r.can_receive, true)
  assert.equal(r.incoming_picking_id, 42)
})

// ── buildEditableReceiptLines ─────────────────────────────────────────────────

test('buildEditableReceiptLines derives pending quantities per move line', () => {
  const lines = buildEditableReceiptLines([
    { move_id: 10, qty_ordered: 12, qty_received: 5, qty_pending: 7 },
  ])
  assert.equal(lines[0].receive_now_qty, 7)
})

test('buildEditableReceiptLines defaults to 0 when qty_pending missing', () => {
  const lines = buildEditableReceiptLines([{ move_id: 1 }])
  assert.equal(lines[0].receive_now_qty, 0)
})

// ── computeReceivableTotals ───────────────────────────────────────────────────

test('computeReceivableTotals sums only positive edited quantities', () => {
  assert.deepEqual(
    computeReceivableTotals([{ receive_now_qty: 0 }, { receive_now_qty: 4 }]),
    { line_count: 1, qty_total: 4 },
  )
})

test('computeReceivableTotals returns zero when all lines are zero', () => {
  assert.deepEqual(
    computeReceivableTotals([{ receive_now_qty: 0 }]),
    { line_count: 0, qty_total: 0 },
  )
})

// ── resolveReceiptBadge ───────────────────────────────────────────────────────

test('resolveReceiptBadge returns received badge metadata for completed receptions', () => {
  const badge = resolveReceiptBadge({ receipt_state: 'received' })
  assert.equal(badge.label, 'Recibido')
  assert.equal(badge.tone, 'success')
})

test('resolveReceiptBadge returns null when receipt_state is absent', () => {
  assert.equal(resolveReceiptBadge({}), null)
})

test('resolveReceiptBadge returns null for empty string receipt_state', () => {
  assert.equal(resolveReceiptBadge({ receipt_state: '' }), null)
})

// ── shouldShowReceiptAction ───────────────────────────────────────────────────

test('shouldShowReceiptAction hides receive CTA once requisition is fully received', () => {
  assert.equal(shouldShowReceiptAction({ receipt_state: 'received', can_receive: false }), false)
})

test('shouldShowReceiptAction shows CTA for confirmed with can_receive=true', () => {
  assert.equal(shouldShowReceiptAction({ receipt_state: 'confirmed', can_receive: true }), true)
})

test('shouldShowReceiptAction hides CTA when can_receive=false even if not received', () => {
  assert.equal(shouldShowReceiptAction({ receipt_state: 'confirmed', can_receive: false }), false)
})
