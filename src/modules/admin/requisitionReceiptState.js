// ── Requisition receipt-state helpers ────────────────────────────────────────
// Pure functions — no React, no side-effects. Testable with node:test.
// Used by: RequisitionReceiptModal, RequisitionDetailModal, AdminRequisicionForm.

const MAP = {
  confirmed:          { key: 'confirmed',          label: 'Confirmado',            tone: 'blue',    canReceive: true  },
  partially_received: { key: 'partially_received', label: 'Parcialmente recibido', tone: 'warning', canReceive: true  },
  received:           { key: 'received',           label: 'Recibido',              tone: 'success', canReceive: false },
}

/** Normalizes a raw receipt_state string to display metadata. */
export function normalizeReceiptState(value) {
  return MAP[value] || { key: 'none', label: '', tone: 'muted', canReceive: false }
}

/** Label for the primary CTA button on a requisition row / detail. */
export function resolveReceiptActionLabel(row = {}) {
  if (!row?.can_receive) return ''
  return row?.receipt_state === 'partially_received' ? 'Continuar recepción' : 'Recibir producto'
}

/** Clamp desired receive qty to the pending qty (never over-receive). */
export function clampReceiveQty(desired, pending) {
  return Math.min(Number(desired || 0), Number(pending || 0))
}

/** Filter out lines with zero receive_now_qty before sending to backend. */
export function buildReceivePayloadLines(lines = []) {
  return lines.filter((l) => Number(l.receive_now_qty || 0) > 0)
}

/**
 * Normalizes receipt summary fields from a requisition row (list or detail).
 * Falls back gracefully when the backend has not yet exposed the new fields.
 */
export function normalizeReceiptSummary(row = {}) {
  return {
    receipt_state:       row.receipt_state || (row.state === 'purchase' ? 'confirmed' : ''),
    qty_received_total:  Number(row.qty_received_total  || 0),
    qty_pending_total:   Number(row.qty_pending_total   || 0),
    can_receive:         Boolean(row.can_receive),
    incoming_picking_id: Number(row.incoming_picking_id || 0),
  }
}

/** Build editable receipt lines pre-filling receive_now_qty = qty_pending. */
export function buildEditableReceiptLines(lines = []) {
  return lines.map((l) => ({
    ...l,
    receive_now_qty: Number(l.qty_pending ?? 0),
  }))
}

/** Aggregate active lines (qty > 0) — used for submit preview in the modal. */
export function computeReceivableTotals(lines = []) {
  const active = lines.filter((l) => Number(l.receive_now_qty || 0) > 0)
  return {
    line_count: active.length,
    qty_total: active.reduce((s, l) => s + Number(l.receive_now_qty || 0), 0),
  }
}

/** Badge metadata for a requisition row. Returns null if no receipt badge should show. */
export function resolveReceiptBadge(row = {}) {
  const meta = normalizeReceiptState(row.receipt_state)
  if (!meta.key || meta.key === 'none') return null
  return meta
}

/** Whether the receive CTA should be visible for a requisition row/detail. */
export function shouldShowReceiptAction(row = {}) {
  return Boolean(row.can_receive) && row.receipt_state !== 'received'
}
