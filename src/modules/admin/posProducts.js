function toQuery(filters = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const search = query.toString()
  return search ? `?${search}` : ''
}

export function buildPosCatalogPath({ warehouseId, companyId, partnerId } = {}) {
  return `/pwa-admin/pos-products${toQuery({
    warehouse_id: warehouseId,
    company_id: companyId,
    partner_id: partnerId,
  })}`
}

export function normalizePosCatalogResponse(payload) {
  const data = payload?.data ?? payload ?? {}
  return {
    pricelist_id: data?.pricelist_id || false,
    pricelist_name: data?.pricelist_name || '',
    products: normalizePosProductsResponse(payload),
  }
}

export function normalizePosProductsResponse(payload) {
  if (Array.isArray(payload)) return payload

  const data = payload?.data
  if (Array.isArray(data)) return data
  if (Array.isArray(payload?.products)) return payload.products
  if (Array.isArray(data?.products)) return data.products

  return []
}
