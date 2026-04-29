export function normalizeRolitoBagNumber(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return 0
  return numeric
}

export function getRolitoRelationId(value) {
  if (Array.isArray(value)) return normalizeRolitoBagNumber(value[0])
  if (value && typeof value === 'object') return normalizeRolitoBagNumber(value.id)
  return normalizeRolitoBagNumber(value)
}

export function sumRolitoUsedBags(packingEntries = []) {
  return (Array.isArray(packingEntries) ? packingEntries : []).reduce((sum, entry) => {
    const materialQty = normalizeRolitoBagNumber(entry?.material_qty_total ?? entry?.materialQtyTotal)
    if (materialQty > 0) return sum + materialQty
    return sum + normalizeRolitoBagNumber(entry?.qty_bags ?? entry?.qtyBags)
  }, 0)
}

export function buildRolitoPackedByMaterial(packingEntries = []) {
  return (Array.isArray(packingEntries) ? packingEntries : []).reduce((acc, entry) => {
    const materialId = getRolitoRelationId(entry?.material_id ?? entry?.materialId)
    if (!materialId) return acc
    const qty = normalizeRolitoBagNumber(entry?.material_qty_total ?? entry?.materialQtyTotal)
    acc[materialId] = (acc[materialId] || 0) + qty
    return acc
  }, {})
}

export function computeRolitoBagDifference({
  bagsReceived = 0,
  bagsUsed = 0,
  bagsRemaining = 0,
  bagsDamaged = 0,
} = {}) {
  return (
    normalizeRolitoBagNumber(bagsReceived)
    - normalizeRolitoBagNumber(bagsUsed)
    - normalizeRolitoBagNumber(bagsRemaining)
    - normalizeRolitoBagNumber(bagsDamaged)
  )
}

export function sumRolitoLocationStock(quantRows = []) {
  return (Array.isArray(quantRows) ? quantRows : []).reduce(
    (sum, quant) => sum + normalizeRolitoBagNumber(quant?.quantity),
    0
  )
}
