export function computePosSummary(lines = []) {
  const subtotal = lines.reduce(
    (sum, line) => sum + Number(line?.qty || line?.product_uom_qty || 0) * Number(line?.price_unit || 0),
    0,
  )

  return {
    subtotal,
    tax: 0,
    total: subtotal,
  }
}
