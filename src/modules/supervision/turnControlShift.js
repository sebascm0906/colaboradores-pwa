const CLOSED_STATES = new Set(['closed', 'cancelled'])
const STORAGE_KEY = 'gfsc.supervision.active_shift.v1'

function isReusableShift(shift) {
  return Boolean(
    shift?.id
    && !CLOSED_STATES.has(String(shift.state || '').toLowerCase())
  )
}

export function resolveTurnControlShift(fetchedShift, navigatedShift = null, persistedShift = null) {
  if (fetchedShift?.id) return fetchedShift
  if (isReusableShift(navigatedShift)) return navigatedShift
  if (isReusableShift(persistedShift)) return persistedShift
  return null
}

export function resolveSupervisionShift(fetchedShift, navigatedShift = null, allowFallbackShift = false) {
  if (fetchedShift?.id) return fetchedShift
  if (allowFallbackShift && isReusableShift(navigatedShift)) return navigatedShift
  return null
}

export function savePersistedTurnControlShift(shift) {
  if (typeof sessionStorage === 'undefined') return
  if (!isReusableShift(shift)) {
    sessionStorage.removeItem(STORAGE_KEY)
    return
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(shift))
}

export function loadPersistedTurnControlShift() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
    return isReusableShift(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearPersistedTurnControlShift() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}

export function isTurnControlShiftReusable(shift) {
  return isReusableShift(shift)
}
