const STORAGE_KEY = 'gfsc.operator_turn_close.v1'

const REQUIRED_OPERATOR_ROLES = ['operador_rolito', 'operador_barra']
const CLOSED_SHIFT_STATES = new Set(['closed', 'done', 'audited', 'cancelled'])

const ROLE_LABELS = {
  operador_rolito: 'Operador Rolito',
  operador_barra: 'Operador Barra',
}

function normalizeShiftCode(value) {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return String(numeric)
  const raw = String(value || '').trim()
  if (!raw) return ''
  const low = raw.toLowerCase()
  if (low === 'dia') return '1'
  if (low === 'noche') return '2'
  return raw
}

function extractShiftScopeParts(shiftLike) {
  if (!shiftLike || typeof shiftLike !== 'object') return null

  const warehouseId = Number(
    shiftLike.warehouse_id
      ?? shiftLike.plant_warehouse_id
      ?? shiftLike.plant_id
      ?? shiftLike.warehouse?.id
      ?? 0
  )
  const date = String(shiftLike.date || shiftLike.shift_date || '').trim()
  const shiftCode = normalizeShiftCode(
    shiftLike.shift_code
      ?? shiftLike.code
      ?? shiftLike.turno
      ?? shiftLike.shift?.shift_code
  )

  if (!warehouseId || !date || !shiftCode) return null
  return { warehouseId, date, shiftCode }
}

function buildScopeKey(shiftLike) {
  const parts = extractShiftScopeParts(shiftLike)
  if (!parts) return ''
  return `scope:${parts.warehouseId}:${parts.date}:${parts.shiftCode}`
}

function buildLegacyKey(shiftLike) {
  const rawId =
    typeof shiftLike === 'object'
      ? shiftLike?.id ?? shiftLike?.shift_id ?? shiftLike?.shift?.id
      : shiftLike
  const value = String(rawId || '').trim()
  return value ? `id:${value}` : ''
}

function resolveLookupKeys(shiftLike) {
  const keys = []
  const scopeKey = buildScopeKey(shiftLike)
  if (scopeKey) keys.push(scopeKey)

  const legacyKey = buildLegacyKey(shiftLike)
  if (legacyKey) {
    keys.push(legacyKey)
    const rawLegacyId = legacyKey.slice(3)
    if (rawLegacyId) keys.push(rawLegacyId)
  }

  return Array.from(new Set(keys.filter(Boolean)))
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

function readShiftEntry(shiftLike) {
  const store = readStore()
  const keys = resolveLookupKeys(shiftLike)
  for (const key of keys) {
    if (store[key]) return { key, data: store[key] }
  }
  return { key: buildScopeKey(shiftLike) || buildLegacyKey(shiftLike) || '', data: {} }
}

function isShiftClosedState(state) {
  return CLOSED_SHIFT_STATES.has(String(state || '').toLowerCase())
}

function buildSummaryItem(role, data = {}, key = '') {
  const rawShiftId = data?.shift_id ?? (String(key || '').startsWith('id:') ? String(key).slice(3) : null)
  return {
    role,
    label: ROLE_LABELS[role] || role,
    closed: Boolean(data?.closed),
    closed_at: data?.closed_at || null,
    employee_name: data?.employee_name || '',
    shift_id: rawShiftId || null,
    shift_state: data?.shift_state || null,
    shift_name: data?.shift_name || '',
    shift_date: data?.shift_date || '',
    shift_code: data?.shift_code || null,
  }
}

export function normalizeOperatorCloseRole(role) {
  const value = String(role || '').toLowerCase()
  if (value.includes('rolito')) return 'operador_rolito'
  if (value.includes('barra')) return 'operador_barra'
  return value
}

export function getOperatorCloseRecord(shiftLike, role) {
  const normalizedRole = normalizeOperatorCloseRole(role)
  const { key, data } = readShiftEntry(shiftLike)
  return buildSummaryItem(normalizedRole, data?.[normalizedRole] || {}, key)
}

export function getOperatorCloseState(shiftLike, role, currentShift = null) {
  const record = getOperatorCloseRecord(shiftLike, role)
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
    effectively_closed: Boolean(record.closed && !stale),
    can_reopen: Boolean(record.closed && matchesCurrentShift && currentShiftOpen),
  }
}

export function getOperatorCloseSummary(shiftLike) {
  const { key, data } = readShiftEntry(shiftLike)
  return REQUIRED_OPERATOR_ROLES.map((role) => buildSummaryItem(role, data?.[role] || {}, key))
}

export function markOperatorTurnClosed(shiftLike, role, payload = {}) {
  const normalizedRole = normalizeOperatorCloseRole(role)
  if (!REQUIRED_OPERATOR_ROLES.includes(normalizedRole)) return false

  const keys = resolveLookupKeys(shiftLike)
  if (keys.length === 0) return false

  const shiftId =
    typeof shiftLike === 'object'
      ? shiftLike?.id ?? shiftLike?.shift_id ?? shiftLike?.shift?.id
      : shiftLike

  const shiftState =
    payload.shift_state
      || (typeof shiftLike === 'object' ? shiftLike?.state || '' : '')
  const shiftName =
    payload.shift_name
      || (typeof shiftLike === 'object' ? shiftLike?.name || '' : '')
  const shiftDate =
    payload.shift_date
      || (typeof shiftLike === 'object' ? shiftLike?.date || shiftLike?.shift_date || '' : '')
  const shiftCode =
    payload.shift_code
      || (typeof shiftLike === 'object' ? shiftLike?.shift_code ?? shiftLike?.code ?? null : null)

  const store = readStore()
  const nextValue = {
    closed: true,
    closed_at: payload.closed_at || new Date().toISOString(),
    employee_name: payload.employee_name || '',
    shift_id: shiftId != null ? String(shiftId) : null,
    shift_state: shiftState,
    shift_name: shiftName,
    shift_date: shiftDate,
    shift_code: shiftCode,
  }

  for (const key of keys) {
    store[key] = {
      ...(store[key] || {}),
      [normalizedRole]: nextValue,
    }
  }
  writeStore(store)
  return true
}

export function isOperatorTurnClosed(shiftLike, role) {
  return getOperatorCloseRecord(shiftLike, role).closed
}

export function clearStaleOperatorTurnClosed(shiftLike, role, currentShift = null) {
  const normalizedRole = normalizeOperatorCloseRole(role)
  if (!REQUIRED_OPERATOR_ROLES.includes(normalizedRole)) return false

  const referenceShift = currentShift || shiftLike
  const currentShiftId =
    typeof referenceShift === 'object' && referenceShift?.id != null
      ? String(referenceShift.id)
      : ''
  if (!currentShiftId) return false

  const keys = resolveLookupKeys(shiftLike)
  if (keys.length === 0) return false

  const store = readStore()
  let removed = false

  for (const key of keys) {
    const nextEntry = { ...(store[key] || {}) }
    const record = nextEntry[normalizedRole]
    if (!record?.closed) continue
    if (String(record.shift_id || '') === currentShiftId) continue

    delete nextEntry[normalizedRole]
    if (Object.keys(nextEntry).length > 0) {
      store[key] = nextEntry
    } else {
      delete store[key]
    }
    removed = true
  }

  if (removed) writeStore(store)
  return removed
}

export function reopenOperatorTurnClosed(shiftLike, role, options = {}) {
  const normalizedRole = normalizeOperatorCloseRole(role)
  if (!REQUIRED_OPERATOR_ROLES.includes(normalizedRole)) return false

  const currentShift = options.currentShift || options.shift || null
  const currentShiftId = currentShift?.id != null ? String(currentShift.id) : null
  const keys = resolveLookupKeys(shiftLike)
  if (keys.length === 0) return false

  const store = readStore()
  let removed = false

  for (const key of keys) {
    const nextEntry = { ...(store[key] || {}) }
    const record = nextEntry[normalizedRole]
    if (!record) continue

    if (currentShiftId) {
      if (String(record.shift_id || '') !== currentShiftId) continue
      if (isShiftClosedState(currentShift.state)) return false
    }

    delete nextEntry[normalizedRole]
    if (Object.keys(nextEntry).length > 0) {
      store[key] = nextEntry
    } else {
      delete store[key]
    }
    removed = true
  }

  if (!removed) return false
  writeStore(store)
  return true
}

export function areRequiredOperatorClosesDone(shiftLike) {
  const summary = getOperatorCloseSummary(shiftLike)
  return summary.every((item) => item.closed)
}

export function clearOperatorTurnClosed(shiftLike) {
  const keys = resolveLookupKeys(shiftLike)
  if (keys.length === 0) return
  const store = readStore()
  for (const key of keys) delete store[key]
  writeStore(store)
}
