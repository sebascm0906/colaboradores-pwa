export function normalizePosProductsResponse(payload) {
  if (Array.isArray(payload)) return payload

  const data = payload?.data
  if (Array.isArray(data)) return data
  if (Array.isArray(payload?.products)) return payload.products
  if (Array.isArray(data?.products)) return data.products

  return []
}
