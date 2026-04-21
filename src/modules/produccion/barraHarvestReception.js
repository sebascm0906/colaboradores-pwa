export function resolveHarvestProduct({ slot = {}, tank = {} } = {}) {
  const slotId = Number(slot?.product_id || 0)
  if (slotId) {
    return {
      product_id: slotId,
      product_name: String(slot?.product_name || '').trim(),
    }
  }

  return {
    product_id: Number(tank?.product_id || 0),
    product_name: String(tank?.product_name || '').trim(),
  }
}

export function buildPtReceptionFromHarvest({ slot = {}, tank = {} } = {}) {
  const product = resolveHarvestProduct({ slot, tank })
  const slotName = String(slot?.name || '').trim()
  const tankName = String(tank?.display_name || tank?.name || '').trim()

  return {
    product_id: product.product_id,
    product_name: product.product_name,
    qty_reported: 8,
    notes: `Cosecha barra ${slotName} · ${tankName}`.trim(),
  }
}
