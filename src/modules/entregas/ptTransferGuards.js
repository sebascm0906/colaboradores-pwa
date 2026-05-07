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
    || normalizeOdooPickingId(transfer.id)
}

export function getPtTransferActionTarget(transfer) {
  const pickingId = getPtTransferActionId(transfer)
  return {
    picking_id: pickingId,
    picking_name: pickingId ? '' : String(transfer?.picking_name || transfer?.name || '').trim(),
  }
}
