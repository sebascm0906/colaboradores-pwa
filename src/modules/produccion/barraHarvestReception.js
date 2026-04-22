export function resolveHarvestProduct({ slot = {}, tank = {} } = {}) {
  const slotId = Number(slot?.product_id || 0)
  if (slotId) {
    return {
      product_id: slotId,
      product_name: String(slot?.product_name || '').trim(),
      source: 'slot',
    }
  }

  const tankId = Number(tank?.product_id || 0)
  if (tankId) {
    return {
      product_id: tankId,
      product_name: String(tank?.product_name || '').trim(),
      source: 'tank',
    }
  }

  return {
    product_id: 0,
    product_name: '',
    source: 'missing',
  }
}

export function resolveHarvestShiftId({ slot = {}, activeShift = {} } = {}) {
  const slotShiftId = Number(slot?.shift_id || 0)
  if (slotShiftId) return slotShiftId
  return Number(activeShift?.id || 0)
}

export function buildPtReceptionFromHarvest({ slot = {}, tank = {} } = {}) {
  const product = resolveHarvestProduct({ slot, tank })
  const slotName = String(slot?.name || '').trim()
  const tankName = String(tank?.display_name || tank?.name || '').trim()

  return {
    product_id: product.product_id,
    product_name: product.product_name,
    qty_reported: 8,
    source_product_id: Number(slot?.product_id || 0),
    source_product_name: String(slot?.product_name || '').trim(),
    notes: `Cosecha barra ${slotName} · ${tankName}`.trim(),
  }
}

function normalizeHarvestedProduct(productId, productName, source) {
  const normalizedId = Number(productId || 0)
  if (!normalizedId) return null
  return {
    product_id: normalizedId,
    product_name: String(productName || '').trim(),
    source,
  }
}

export function resolvePackedProductFromHarvest({ harvestResult = {}, fallbackProduct = {} } = {}) {
  const candidates = [
    normalizeHarvestedProduct(harvestResult?.product_id, harvestResult?.product_name, 'harvest'),
    normalizeHarvestedProduct(harvestResult?.data?.product_id, harvestResult?.data?.product_name, 'harvest'),
    normalizeHarvestedProduct(harvestResult?.result?.product_id, harvestResult?.result?.product_name, 'harvest'),
    normalizeHarvestedProduct(fallbackProduct?.product_id, fallbackProduct?.product_name, 'fallback'),
  ]

  return candidates.find(Boolean) || {
    product_id: 0,
    product_name: '',
    source: 'missing',
  }
}
