export function normalizeAdditionalRoles(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((role) => String(role || '').trim())
    .filter(Boolean)
}

export function getEffectiveRoles(session = {}) {
  const primary = String(session?.role || '').trim()
  const extras = normalizeAdditionalRoles(session?.additional_roles)
  return [...new Set([primary, ...extras].filter(Boolean))]
}

export function hasEffectiveRole(session, role) {
  return getEffectiveRoles(session).includes(String(role || '').trim())
}
