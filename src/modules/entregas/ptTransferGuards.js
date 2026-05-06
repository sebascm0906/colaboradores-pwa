export function normalizeOdooPickingId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

export function isOdooPickingId(value) {
  return normalizeOdooPickingId(value) !== null
}
