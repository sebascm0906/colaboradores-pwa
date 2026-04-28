export function getDisplayStock(product) {
  return Number(product?.stock ?? product?.qty_available ?? 0)
}

export function addProductToCart(cart = [], product = {}) {
  const stock = getDisplayStock(product)
  const existing = cart.find((item) => item.product_id === product.id)

  if (existing) {
    return cart.map((item) =>
      item.product_id === product.id
        ? { ...item, qty: item.qty + 1 }
        : item,
    )
  }

  return [
    ...cart,
    {
      product_id: product.id,
      name: product.name,
      qty: 1,
      price_unit: Number(product.price || product.list_price || 0),
      stock,
    },
  ]
}

export function changeCartItemQty(cart = [], productId, delta) {
  return cart
    .map((item) => {
      if (item.product_id !== productId) return item
      const qty = item.qty + delta
      if (qty <= 0) return null
      return { ...item, qty }
    })
    .filter(Boolean)
}

export function stockLabel(stock) {
  return `Stock ${Number(stock || 0)}`
}
