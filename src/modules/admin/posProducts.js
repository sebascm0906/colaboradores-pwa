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

function normalizeRelation(value) {
  if (Array.isArray(value)) {
    return {
      id: Number(value[0] || 0) || false,
      name: String(value[1] || '').trim(),
    }
  }
  if (value && typeof value === 'object') {
    return {
      id: Number(value.id || 0) || false,
      name: String(value.name || value.display_name || '').trim(),
    }
  }
  return {
    id: Number(value || 0) || false,
    name: '',
  }
}

export function normalizePosCatalogResponse(payload) {
  const data = payload?.data ?? payload ?? {}
  const pricelist = normalizeRelation(
    data?.pricelist_id
    || data?.pricelist
    || data?.price_list
    || data?.priceList,
  )
  return {
    pricelist_id: pricelist.id,
    pricelist_name: String(data?.pricelist_name || pricelist.name || '').trim(),
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
