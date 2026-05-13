export function shouldLoadCustomerSuggestions(query) {
  const normalized = String(query || '').trim()
  return normalized.length === 0 || normalized.length >= 2
}

export function normalizeCustomerResults(response) {
  const data = response?.data ?? response
  return Array.isArray(data) ? data : []
}
