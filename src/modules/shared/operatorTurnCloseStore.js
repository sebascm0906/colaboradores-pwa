const STORAGE_KEY = 'gfsc.operator_turn_close.v1'

const REQUIRED_OPERATOR_ROLES = ['operador_rolito', 'operador_barra']
const CLOSED_SHIFT_STATES = new Set(['closed', 'done', 'audited', 'cancelled'])

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

function isShiftClosedState(state) {
  return CLOSED_SHIFT_STATES.has(String(state || '').toLowerCase())
}

function getShiftEntry(shiftId, role) {
  const normalizedRole = normalizeOperatorCloseRole(role)
  const key = String(shiftId || '')
  const store = readStore()
  const entry = store?.[key]?.[normalizedRole]
  return {
    key,
    normalizedRole,
    entry,
    store,
  }
}

function buildSummaryItem(role, data = {}) {
  return {
    role,
    label: ROLE_LABELS[role] || role,
    closed: Boolean(data?.closed),
    closed_at: data?.closed_at || null,
    employee_name: data?.employee_name || '',
    shift_id: data?.shift_id || null,
    shift_state: data?.shift_state || null,
    shift_name: data?.shift_name || '',
    shift_date: data?.shift_date || '',
    shift_code: data?.shift_code || null,
  }
}

export function getOperatorCloseRecord(shiftId, role) {
  const { normalizedRole, entry, key } = getShiftEntry(shiftId, role)
  return buildSummaryItem(normalizedRole, {
    ...(entry || {}),
    shift_id: key || null,
  })
}

export function getOperatorCloseState(shiftId, role, currentShift = null) {
  const record = getOperatorCloseRecord(shiftId, role)
  const currentShiftId = currentShift?.id != null ? String(currentShift.id) : null
  const currentShiftState = String(currentShift?.state || '').toLowerCase()
  const matchesCurrentShift = Boolean(currentShiftId && String(record.shift_id || '') === currentShiftId)
  const currentShiftOpen = Boolean(currentShift?.id != null && !isShiftClosedState(currentShiftState))
  const stale = Boolean(record.closed && currentShift?.id != null && !matchesCurrentShift)
  return {
    ...record,
    current_shift_id: currentShiftId,
    current_shift_state: currentShift?.state || null,
    matches_current_shift: matchesCurrentShift,
    current_shift_open: currentShiftOpen,
    stale,
    can_reopen: Boolean(record.closed && matchesCurrentShift && currentShiftOpen),
  }
}

export function getOperatorCloseSummary(shiftId) {
  const key = String(shiftId || '')
  const data = readStore()[key] || {}
  return REQUIRED_OPERATOR_ROLES.map((role) => buildSummaryItem(role, {
    ...(data?.[role] || {}),
    shift_id: key || null,
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
      shift_id: key,
      shift_state: payload.shift_state || '',
      shift_name: payload.shift_name || '',
      shift_date: payload.shift_date || '',
      shift_code: payload.shift_code || null,
    },
  }
  writeStore(store)
  return true
}

export function isOperatorTurnClosed(shiftId, role) {
  return getOperatorCloseRecord(shiftId, role).closed
}

export function reopenOperatorTurnClosed(shiftId, role, options = {}) {
  const normalizedRole = normalizeOperatorCloseRole(role)
  if (!shiftId || !REQUIRED_OPERATOR_ROLES.includes(normalizedRole)) return false

  const currentShift = options.currentShift || options.shift || null
  if (currentShift?.id != null) {
    const currentShiftId = String(currentShift.id)
    if (currentShiftId !== String(shiftId)) return false
    if (isShiftClosedState(currentShift.state)) return false
  }

  const store = readStore()
  const key = String(shiftId)
  const nextEntry = { ...(store[key] || {}) }
  if (!nextEntry[normalizedRole]) return false
  delete nextEntry[normalizedRole]
  if (Object.keys(nextEntry).length > 0) {
    store[key] = nextEntry
  } else {
    delete store[key]
  }
  writeStore(store)
  return true
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
