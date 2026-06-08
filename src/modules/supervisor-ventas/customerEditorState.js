function toMany2oneName(value) {
  if (Array.isArray(value)) return String(value[1] || '').trim()
  if (value && typeof value === 'object') {
    return String(value.name || value.display_name || '').trim()
  }
  return ''
}

function cleanText(value) {
  return String(value ?? '').trim()
}

function cleanNumberText(value) {
  const text = cleanText(value)
  if (!text) return ''
  const number = Number(text)
  return Number.isFinite(number) ? String(number) : text
}

function buildAddress(row = {}) {
  const parts = [
    cleanText(row.street),
    cleanText(row.street2),
    cleanText(row.city),
    toMany2oneName(row.state_id),
    cleanText(row.zip),
  ].filter(Boolean)
  return parts.join(', ')
}

export function normalizeSupervisorCustomer(row = {}) {
  const latitude = row.latitude ?? row.partner_latitude ?? ''
  const longitude = row.longitude ?? row.partner_longitude ?? ''

  return {
    id: Number(row.id || 0),
    name: cleanText(row.name || row.display_name),
    phone: cleanText(row.phone || row.mobile),
    email: cleanText(row.email),
    latitude: cleanNumberText(latitude),
    longitude: cleanNumberText(longitude),
    address: buildAddress(row),
    reference: cleanText(row.ref),
  }
}

export function buildCustomerEditorDraft(customer = {}) {
  const normalized = normalizeSupervisorCustomer(customer)
  return {
    name: normalized.name,
    phone: normalized.phone,
    email: normalized.email,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
  }
}

export function getCustomerEditorChanges(original = {}, draft = {}) {
  const base = buildCustomerEditorDraft(original)
  const current = {
    name: cleanText(draft.name),
    phone: cleanText(draft.phone),
    email: cleanText(draft.email),
    latitude: cleanNumberText(draft.latitude),
    longitude: cleanNumberText(draft.longitude),
  }

  return Object.keys(base).reduce((changes, key) => {
    if (current[key] !== base[key]) changes[key] = current[key]
    return changes
  }, {})
}

export function hasCustomerEditorChanges(original = {}, draft = {}) {
  return Object.keys(getCustomerEditorChanges(original, draft)).length > 0
}

export function getCustomerEditorValidationError(draft = {}) {
  if (!cleanText(draft.name)) return 'El nombre del cliente es obligatorio.'
  const lat = cleanText(draft.latitude)
  const lng = cleanText(draft.longitude)
  if (lat && !Number.isFinite(Number(lat))) return 'La latitud debe ser numerica.'
  if (lng && !Number.isFinite(Number(lng))) return 'La longitud debe ser numerica.'
  return ''
}

export function buildSupervisorCustomerUpdatePayload(customerId, original = {}, draft = {}) {
  const changes = getCustomerEditorChanges(original, draft)
  const payload = {}

  if (Object.prototype.hasOwnProperty.call(changes, 'name')) payload.name = changes.name
  if (Object.prototype.hasOwnProperty.call(changes, 'phone')) payload.phone = changes.phone || false
  if (Object.prototype.hasOwnProperty.call(changes, 'email')) payload.email = changes.email || false
  if (Object.prototype.hasOwnProperty.call(changes, 'latitude')) {
    payload.latitude = changes.latitude === '' ? false : Number(changes.latitude)
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'longitude')) {
    payload.longitude = changes.longitude === '' ? false : Number(changes.longitude)
  }

  return {
    customer_id: Number(customerId || original?.id || 0),
    values: payload,
  }
}
