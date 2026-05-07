export function normalizeOdooPickingId(value) {
  if (Array.isArray(value)) return normalizeOdooPickingId(value[0])
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

export function isOdooPickingId(value) {
  return normalizeOdooPickingId(value) !== null
}

export function getPtTransferActionId(transfer) {
  if (!transfer || typeof transfer !== 'object') return null
  return normalizeOdooPickingId(transfer.picking_id)
    || normalizeOdooPickingId(transfer.stock_picking_id)
    || normalizeOdooPickingId(transfer.odoo_picking_id)
    || normalizeOdooPickingId(transfer.backend_id)
    || normalizeOdooPickingId(transfer.transfer_id)
    || normalizeOdooPickingId(transfer.id)
}
