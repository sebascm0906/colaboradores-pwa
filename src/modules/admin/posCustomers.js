export function shouldLoadCustomerSuggestions(query) {
  const normalized = String(query || '').trim()
  return normalized.length === 0 || normalized.length >= 2
}

export function canRefreshCustomerPricelist(customer) {
  return Boolean(Number(customer?.id || 0))
}

function relationId(value) {
  if (Array.isArray(value)) return Number(value[0] || 0) || 0
  if (value && typeof value === 'object') return Number(value.id || value.partner_id || value.customer_id || 0) || 0
  return Number(value || 0) || 0
}

function relationName(value) {
  if (Array.isArray(value)) return String(value[1] || '').trim()
  if (value && typeof value === 'object') {
    return String(value.name || value.display_name || value.partner_name || value.customer_name || '').trim()
  }
  return ''
}

function normalizeCustomerRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null

  const id = relationId(record.id)
    || relationId(record.partner_id)
    || relationId(record.customer_id)
  if (!id) return null

  const relationLabel = relationName(record.partner_id) || relationName(record.customer_id)
  const name = String(
    record.name
    || record.display_name
    || record.partner_name
    || record.customer_name
    || relationLabel
    || `Cliente #${id}`,
  ).trim()

  return { ...record, id, name }
}

export function normalizeCustomerResults(response) {
  const data = response?.data ?? response
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.customers)
      ? data.customers
      : Array.isArray(response?.customers)
        ? response.customers
        : []
  return list.map(normalizeCustomerRecord).filter(Boolean)
}

export function normalizeDefaultCustomerResponse(response) {
  const data = response?.data ?? response
  if (!data || Array.isArray(data)) return null
  if (data.customer && typeof data.customer === 'object') return normalizeCustomerRecord(data.customer)
  const customer = normalizeCustomerRecord(data)
  if (customer) return customer
  return null
}
