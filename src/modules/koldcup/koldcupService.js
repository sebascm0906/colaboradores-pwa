import { api } from '../../lib/api.js'

function toQuery(filters = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

function n(value) {
  return Number(value || 0) || 0
}

export function buildKoldcupPurchasePayload({
  warehouseId,
  employeeId,
  supplierId,
  productId,
  qty,
  unitPrice,
  notes,
}) {
  const payload = {
    warehouse_id: n(warehouseId),
    employee_id: n(employeeId),
    product_id: n(productId),
    qty: n(qty),
    unit_price: n(unitPrice),
    notes: String(notes || '').trim(),
  }
  if (n(supplierId)) payload.supplier_id = n(supplierId)
  return payload
}

export function buildKoldcupClosePayload({
  warehouseId,
  employeeId,
  date,
  finalInputCount,
  finalFinishedCount,
  differenceReason,
}) {
  return {
    warehouse_id: n(warehouseId),
    employee_id: n(employeeId),
    date,
    final_input_count: n(finalInputCount),
    final_finished_count: n(finalFinishedCount),
    difference_reason: String(differenceReason || '').trim(),
  }
}

export function buildKoldcupTransferPayload({
  warehouseId,
  employeeId,
  date,
  productId,
  qty,
}) {
  return {
    warehouse_id: n(warehouseId),
    employee_id: n(employeeId),
    date,
    product_id: n(productId),
    qty: n(qty),
  }
}

export function getKoldcupDaySummary({ warehouseId, employeeId, date } = {}) {
  return api('GET', `/pwa-koldcup/day-summary${toQuery({ warehouse_id: warehouseId, employee_id: employeeId, date })}`)
}

export function getKoldcupPurchaseCatalog({ warehouseId, employeeId } = {}) {
  return api('GET', `/pwa-koldcup/purchase-catalog${toQuery({ warehouse_id: warehouseId, employee_id: employeeId })}`)
}

export function createKoldcupPurchase(payload) {
  return api('POST', '/pwa-koldcup/purchase-create', payload)
}

export function closeKoldcupDay(payload) {
  return api('POST', '/pwa-koldcup/day-close', payload)
}

export function transferKoldcupToEntregas(payload) {
  return api('POST', '/pwa-koldcup/transfer-to-entregas', payload)
}
