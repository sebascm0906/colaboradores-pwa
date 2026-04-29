const STORAGE_KEY = 'gfsc.rolito_bag_return_declaration.v1'

function parseStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function normalizeShiftId(shiftLike) {
  if (!shiftLike) return ''
  const raw =
    typeof shiftLike === 'object'
      ? shiftLike?.id ?? shiftLike?.shift_id ?? shiftLike?.shift?.id
      : shiftLike
  const value = String(raw || '').trim()
  return value || ''
}

export function normalizeBagCount(value) {
  const numeric = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return numeric
}

export function buildBagReturnDeclarationSummary({
  shiftId,
  bagsReceived = 0,
  bagsUsed = 0,
  bagsRemaining = 0,
  totalDamaged = 0,
  totalReturned = 0,
  notes = '',
  lines = [],
  declaredAt = new Date().toISOString(),
} = {}) {
  return {
    shift_id: normalizeShiftId(shiftId),
    bags_received: normalizeBagCount(bagsReceived),
    bags_used: normalizeBagCount(bagsUsed),
    bags_remaining: normalizeBagCount(bagsRemaining),
    total_damaged: normalizeBagCount(totalDamaged),
    total_returned: normalizeBagCount(totalReturned),
    notes: String(notes || '').trim(),
    declared_at: declaredAt,
    lines: Array.isArray(lines)
      ? lines.map((line) => ({
          key: String(line?.key || ''),
          name: String(line?.name || ''),
          issued: normalizeBagCount(line?.issued),
          consumed: normalizeBagCount(line?.consumed),
          remaining: normalizeBagCount(line?.remaining),
          damaged: normalizeBagCount(line?.damaged),
          returned: normalizeBagCount(line?.returned),
          material_id: Number(line?.material_id || 0) || null,
          settlement_id: Number(line?.settlement_id || 0) || null,
          issue_id: Number(line?.issue_id || 0) || null,
          product_id: Number(line?.product_id || 0) || null,
          line_id: Number(line?.line_id || 0) || null,
          shift_id: Number(line?.shift_id || 0) || null,
        }))
      : [],
  }
}

export function saveBagReturnDeclaration(shiftLike, summary) {
  const shiftId = normalizeShiftId(shiftLike || summary?.shift_id)
  if (!shiftId) return false
  const store = parseStore()
  store[shiftId] = buildBagReturnDeclarationSummary({ ...summary, shiftId })
  writeStore(store)
  return true
}

export function getBagReturnDeclaration(shiftLike) {
  const shiftId = normalizeShiftId(shiftLike)
  if (!shiftId) return null
  const store = parseStore()
  return store[shiftId] || null
}

export function clearBagReturnDeclaration(shiftLike) {
  const shiftId = normalizeShiftId(shiftLike)
  if (!shiftId) return false
  const store = parseStore()
  if (!store[shiftId]) return false
  delete store[shiftId]
  writeStore(store)
  return true
}

export function matchesBagReturnDeclaration(summary, {
  bagsReceived = 0,
  bagsUsed = 0,
  bagsRemaining = 0,
} = {}) {
  if (!summary) return false
  return (
    normalizeBagCount(summary.bags_received) === normalizeBagCount(bagsReceived) &&
    normalizeBagCount(summary.bags_used) === normalizeBagCount(bagsUsed) &&
    normalizeBagCount(summary.bags_remaining) === normalizeBagCount(bagsRemaining)
  )
}

export function buildRolitoBagDeclarationItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => normalizeBagCount(item?.issued) > 0)
    .map((item, index) => {
      const issued = normalizeBagCount(item?.issued)
      const consumed = normalizeBagCount(item?.consumed)
      const remaining = normalizeBagCount(item?.remaining)
      return {
        key: String(
          item?.settlementId
          || item?.settlement_id
          || item?.issueId
          || item?.issue_id
          || item?.materialId
          || item?.material_id
          || index
        ),
        issue_id: Number(item?.issueId || item?.issue_id || item?.id || 0) || null,
        settlement_id: Number(item?.settlementId || item?.settlement_id || 0) || null,
        material_id: Number(item?.materialId || item?.material_id || 0) || null,
        product_id: Number(item?.productId || item?.product_id || 0) || null,
        line_id: Number(item?.lineId || item?.line_id || 0) || null,
        shift_id: Number(item?.shiftId || item?.shift_id || 0) || null,
        name: String(item?.name || item?.material_name || item?.product_name || 'Material'),
        state: String(item?.state || item?.settlement_state || ''),
        issued,
        consumed,
        remaining,
      }
    })
}

export function computeRolitoBagDeclarationTotals(items = [], damagedByKey = {}) {
  const normalizedItems = buildRolitoBagDeclarationItems(items)
  const lines = normalizedItems.map((item) => {
    const requestedDamaged = normalizeBagCount(damagedByKey?.[item.key])
    const damaged = Math.min(item.remaining, requestedDamaged)
    const returned = Math.max(0, item.remaining - damaged)
    const qtyConsumed = Math.max(0, item.issued - item.remaining)
    return {
      ...item,
      damaged,
      returned,
      qty_consumed: qtyConsumed,
    }
  })

  return {
    lines,
    totalIssued: lines.reduce((sum, item) => sum + item.issued, 0),
    totalConsumed: lines.reduce((sum, item) => sum + item.qty_consumed, 0),
    totalRemaining: lines.reduce((sum, item) => sum + item.remaining, 0),
    totalDamaged: lines.reduce((sum, item) => sum + item.damaged, 0),
    totalReturned: lines.reduce((sum, item) => sum + item.returned, 0),
  }
}

export function buildRolitoBagResolutionPayloads(items = [], damagedByKey = {}) {
  const totals = computeRolitoBagDeclarationTotals(items, damagedByKey)
  return totals.lines.map((item) => ({
    key: item.key,
    settlementId: item.settlement_id || null,
    shiftId: item.shift_id || null,
    lineId: item.line_id || null,
    materialId: item.material_id || null,
    issueId: item.issue_id || null,
    productId: item.product_id || null,
    name: item.name,
    issued: item.issued,
    consumed: item.qty_consumed,
    remaining: item.remaining,
    qtyReturned: item.returned,
    qtyDamaged: item.damaged,
    qtyConsumed: item.qty_consumed,
  }))
}
