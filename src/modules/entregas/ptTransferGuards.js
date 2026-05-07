export function normalizeOdooPickingId(value) {
  if (Array.isArray(value)) return normalizeOdooPickingId(value[0])
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

export function isOdooPickingId(value) {
  return normalizeOdooPickingId(value) !== null
}

export function normalizePtTransferActionId(value) {
  if (Array.isArray(value)) return normalizePtTransferActionId(value[0])
  const id = Number(value)
  if (!Number.isInteger(id) || id === 0) return null
  return id
}

export function isPtTransferActionId(value) {
  return normalizePtTransferActionId(value) !== null
}

export function getPtTransferActionId(transfer) {
  if (!transfer || typeof transfer !== 'object') return null
  return normalizePtTransferActionId(transfer.picking_id)
    || normalizePtTransferActionId(transfer.stock_picking_id)
    || normalizePtTransferActionId(transfer.odoo_picking_id)
    || normalizePtTransferActionId(transfer.backend_id)
    || normalizePtTransferActionId(transfer.id)
}

export function getPtTransferActionTarget(transfer) {
  const actionId = getPtTransferActionId(transfer)
  const realPickingId = normalizeOdooPickingId(transfer?.picking_id)
    || normalizeOdooPickingId(transfer?.stock_picking_id)
    || normalizeOdooPickingId(transfer?.odoo_picking_id)
    || normalizeOdooPickingId(transfer?.backend_id)
    || normalizeOdooPickingId(transfer?.id)
  return {
    action_id: actionId,
    picking_id: realPickingId,
    picking_name: actionId ? '' : String(transfer?.picking_name || transfer?.name || '').trim(),
  }
}
