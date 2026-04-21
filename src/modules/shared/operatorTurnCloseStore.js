const STORAGE_KEY = 'gfsc.operator_turn_close.v1'

const REQUIRED_OPERATOR_ROLES = ['operador_rolito', 'operador_barra']

const ROLE_LABELS = {
  operador_rolito: 'Operador Rolito',
  operador_barra: 'Operador Barra',
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeStore(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function normalizeOperatorCloseRole(role) {
  const value = String(role || '').toLowerCase()
  if (value.includes('rolito')) return 'operador_rolito'
  if (value.includes('barra')) return 'operador_barra'
  return value
}

export function getOperatorCloseSummary(shiftId) {
  const key = String(shiftId || '')
  const data = readStore()[key] || {}
  return REQUIRED_OPERATOR_ROLES.map((role) => ({
    role,
    label: ROLE_LABELS[role] || role,
    closed: Boolean(data?.[role]?.closed),
    closed_at: data?.[role]?.closed_at || null,
    employee_name: data?.[role]?.employee_name || '',
  }))
}

export function markOperatorTurnClosed(shiftId, role, payload = {}) {
  const normalizedRole = normalizeOperatorCloseRole(role)
  if (!shiftId || !REQUIRED_OPERATOR_ROLES.includes(normalizedRole)) return false

  const store = readStore()
  const key = String(shiftId)
  store[key] = {
    ...(store[key] || {}),
    [normalizedRole]: {
      closed: true,
      closed_at: payload.closed_at || new Date().toISOString(),
      employee_name: payload.employee_name || '',
    },
  }
  writeStore(store)
  return true
}

export function isOperatorTurnClosed(shiftId, role) {
  const normalizedRole = normalizeOperatorCloseRole(role)
  const key = String(shiftId || '')
  const store = readStore()
  return Boolean(store?.[key]?.[normalizedRole]?.closed)
}

export function areRequiredOperatorClosesDone(shiftId) {
  const summary = getOperatorCloseSummary(shiftId)
  return summary.every((item) => item.closed)
}

export function clearOperatorTurnClosed(shiftId) {
  const key = String(shiftId || '')
  if (!key) return
  const store = readStore()
  delete store[key]
  writeStore(store)
}
