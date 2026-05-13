export function shouldLoadCustomerSuggestions(query) {
  const normalized = String(query || '').trim()
  return normalized.length === 0 || normalized.length >= 2
}

export function normalizeCustomerResults(response) {
  const data = response?.data ?? response
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.customers)) return data.customers
  if (Array.isArray(response?.customers)) return response.customers
  return []
}

export function normalizeDefaultCustomerResponse(response) {
  const data = response?.data ?? response
  if (!data || Array.isArray(data)) return null
  if (data.customer && typeof data.customer === 'object') return data.customer
  if (typeof data.id === 'number' || typeof data.id === 'string') return data
  return null
}
