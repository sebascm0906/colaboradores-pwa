export function buildLoadPreviewSummary({ lines = [], stockItems = [] } = {}) {
  const requestedByProduct = new Map()

  for (const line of lines) {
    const productId = Number(line?.product_id || 0)
    const qty = Number(line?.qty || 0)
    if (!productId || qty <= 0) continue

    const current = requestedByProduct.get(productId) || {
      product_id: productId,
      product_name: line?.product_name || '',
      requested: 0,
    }

    current.requested += qty
    if (!current.product_name && line?.product_name) current.product_name = line.product_name
    requestedByProduct.set(productId, current)
  }

  return Array.from(requestedByProduct.values()).map((row) => {
    const stockItem = stockItems.find((item) => Number(item?.product_id || 0) === row.product_id)
    const onHand = Number(stockItem?.on_hand || 0)
    const remaining = onHand - row.requested

    return {
      ...row,
      onHand,
      remaining,
      sufficient: remaining >= 0,
    }
  })
}
