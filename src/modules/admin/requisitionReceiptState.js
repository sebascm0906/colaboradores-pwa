const RECEIPT_STATE_MAP = {
  confirmed: {
    key: 'confirmed',
    label: 'Confirmado',
    tone: 'blue',
    canReceive: true,
  },
  partially_received: {
    key: 'partially_received',
    label: 'Parcialmente recibido',
    tone: 'warning',
    canReceive: true,
  },
  received: {
    key: 'received',
    label: 'Recibido',
    tone: 'success',
    canReceive: false,
  },
}

function toPositiveNumber(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  return num
}

export function normalizeReceiptState(value) {
  return RECEIPT_STATE_MAP[value] || {
    key: 'none',
    label: '',
    tone: 'muted',
    canReceive: false,
  }
}

export function resolveReceiptActionLabel(row = {}) {
  if (!row?.can_receive) return ''
  return row?.receipt_state === 'partially_received'
    ? 'Continuar recepción'
    : 'Recibir producto'
}

export function clampReceiveQty(requestedQty, pendingQty) {
  const requested = toPositiveNumber(requestedQty)
  const pending = toPositiveNumber(pendingQty)
  return Math.min(requested, pending)
}

export function buildReceivePayloadLines(lines = []) {
  if (!Array.isArray(lines)) return []

  return lines
    .map((line) => ({
      move_id: Number(line?.move_id || 0),
      receive_now_qty: toPositiveNumber(line?.receive_now_qty),
    }))
    .filter((line) => line.move_id > 0 && line.receive_now_qty > 0)
}

export function normalizeReceiptSummary(row = {}) {
  return {
    receipt_state: row?.receipt_state || (row?.state === 'purchase' ? 'confirmed' : ''),
    qty_received_total: Number(row?.qty_received_total || 0),
    qty_pending_total: Number(row?.qty_pending_total || 0),
    can_receive: Boolean(row?.can_receive),
    incoming_picking_id: Number(row?.incoming_picking_id || 0),
  }
}

export function buildEditableReceiptLines(lines = []) {
  if (!Array.isArray(lines)) return []

  return lines.map((line, index) => {
    const qtyOrdered = Number(line?.qty_ordered || line?.qty || 0)
    const qtyReceived = Number(line?.qty_received || 0)
    const qtyPending = Number(line?.qty_pending || Math.max(0, qtyOrdered - qtyReceived))

    return {
      id: Number(line?.id || index + 1),
      move_id: Number(line?.move_id || line?.stock_move_id || line?.id || 0),
      product_id: Number(line?.product_id || 0),
      product_name: line?.product_name || line?.name || '',
      uom: line?.uom || '',
      qty_ordered: qtyOrdered,
      qty_received: qtyReceived,
      qty_pending: qtyPending,
      receive_now_qty: qtyPending,
    }
  })
}

export function computeReceivableTotals(lines = []) {
  if (!Array.isArray(lines)) return { line_count: 0, qty_total: 0 }

  return lines.reduce((acc, line) => {
    const qty = toPositiveNumber(line?.receive_now_qty)
    if (qty <= 0) return acc
    return {
      line_count: acc.line_count + 1,
      qty_total: acc.qty_total + qty,
    }
  }, { line_count: 0, qty_total: 0 })
}

export function resolveReceiptBadge(row = {}) {
  const summary = normalizeReceiptSummary(row)
  const state = normalizeReceiptState(summary.receipt_state)
  if (!state.label) return null

  return {
    key: state.key,
    label: state.label,
    tone: state.tone,
  }
}

export function shouldShowReceiptAction(row = {}) {
  const summary = normalizeReceiptSummary(row)
  return Boolean(summary.can_receive) && summary.receipt_state !== 'received'
}
