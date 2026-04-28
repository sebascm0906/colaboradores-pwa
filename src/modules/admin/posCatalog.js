export function buildWarehouseStockByProduct(quants = []) {
  return quants.reduce((acc, row) => {
    const productId = row?.product_id?.[0] || row?.product_id || 0
    if (!productId) return acc
    const onHand = Number(row?.quantity || 0)
    const reserved = Number(row?.reserved_quantity || 0)
    const next = Math.max(0, (acc[productId] || 0) + onHand - reserved)
    acc[productId] = Math.round(next * 1000) / 1000
    return acc
  }, {})
}

export function mergeProductsWithWarehouseStock(products = [], stockByProduct = {}) {
  return products
    .filter((row) => row.available_in_pos !== false)
    .map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.list_price ?? row.lst_price ?? 0),
      stock: Number(stockByProduct[row.id] || 0),
      barcode: row.barcode || '',
      weight: Number(row.weight ?? 0),
      sale_ok: row.sale_ok !== false,
      available_in_pos: row.available_in_pos !== false,
    }))
}
