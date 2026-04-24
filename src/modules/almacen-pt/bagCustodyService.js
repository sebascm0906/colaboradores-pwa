import { api } from '../../lib/api.js'

export function normalizeBagCustodyRecord(raw = {}) {
  return {
    id: Number(raw?.id || 0) || null,
    shift_id: Number(raw?.shift_id || 0) || null,
    destination_key: raw?.destination_key || '',
    destination_role: raw?.destination_role || '',
    worker_employee_id: Number(raw?.worker_employee_id || 0) || null,
    manager_employee_id: Number(raw?.manager_employee_id || 0) || null,
    bags_issued: Number(raw?.bags_issued || 0),
    bags_declared_by_worker: Number(raw?.bags_declared_by_worker || 0),
    bags_validated_by_manager: Number(raw?.bags_validated_by_manager || 0),
    bag_unit_cost: Number(raw?.bag_unit_cost || 0),
    difference_bags: Number(raw?.difference_bags || 0),
    difference_amount: Number(raw?.difference_amount || 0),
    debt_created: Boolean(raw?.debt_created),
    worker_notes: raw?.worker_notes || '',
    manager_notes: raw?.manager_notes || '',
    issued_at: raw?.issued_at || '',
    declared_at: raw?.declared_at || '',
    validated_at: raw?.validated_at || '',
    state: raw?.state || 'draft',
  }
}

export function computeBagDifference({
  bagsIssued = 0,
  bagsValidatedByManager = 0,
  bagUnitCost = 0,
} = {}) {
  const differenceBags = Math.max(
    0,
    Number(bagsIssued) - Number(bagsValidatedByManager)
  )
  const differenceAmount = differenceBags * Number(bagUnitCost || 0)
  return {
    differenceBags,
    differenceAmount,
    debtRequired: differenceBags > 0,
  }
}

export async function getPendingBagCustody({ warehouseId, employeeId, role } = {}) {
  const qs = new URLSearchParams()
  if (warehouseId) qs.set('warehouse_id', String(warehouseId))
  if (employeeId) qs.set('employee_id', String(employeeId))
  if (role) qs.set('role', String(role))

  const suffix = qs.toString()
  const res = await api(
    'GET',
    `/api/production/bags/custody/pending${suffix ? `?${suffix}` : ''}`
  )
  const payload = res?.data ?? res ?? {}
  const items = Array.isArray(payload?.items)
    ? payload.items.map((item) => normalizeBagCustodyRecord(item))
    : []

  return {
    items,
    raw: payload,
  }
}

export async function issueBagCustody(data = {}) {
  const res = await api('POST', '/api/production/bags/custody/issue', {
    warehouse_id: Number(data?.warehouseId || 0) || undefined,
    destination_key: data?.destinationKey || '',
    worker_employee_id: Number(data?.workerEmployeeId || 0) || undefined,
    bags_issued: Number(data?.bagsIssued || 0),
    bag_unit_cost: Number(data?.bagUnitCost || 0),
    issued_by: Number(data?.issuedBy || 0) || undefined,
    notes: data?.notes || '',
  })

  return normalizeBagCustodyRecord(res?.record ?? res?.data ?? res ?? {})
}

export async function declareBagCustody(data = {}) {
  const res = await api('POST', '/api/production/bags/custody/declare', {
    custody_id: Number(data?.custodyId || 0) || undefined,
    bags_declared_by_worker: Number(data?.bagsDeclaredByWorker || 0),
    employee_id: Number(data?.employeeId || 0) || undefined,
    notes: data?.notes || '',
  })

  return normalizeBagCustodyRecord(res?.record ?? res?.data ?? res ?? {})
}

export async function validateBagCustody(data = {}) {
  const res = await api('POST', '/api/production/bags/custody/validate', {
    custody_id: Number(data?.custodyId || 0) || undefined,
    bags_validated_by_manager: Number(data?.bagsValidatedByManager || 0),
    employee_id: Number(data?.employeeId || 0) || undefined,
    notes: data?.notes || '',
  })

  return normalizeBagCustodyRecord(res?.record ?? res?.data ?? res ?? {})
}
