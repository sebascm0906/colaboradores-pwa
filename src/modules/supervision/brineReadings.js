function toDateOnly(value = '') {
  return String(value || '').trim().slice(0, 10)
}

function formatDateKey(date, useUTC = false) {
  const year = useUTC ? date.getUTCFullYear() : date.getFullYear()
  const month = String((useUTC ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0')
  const day = String(useUTC ? date.getUTCDate() : date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTodayDateKey(date = new Date()) {
  return formatDateKey(date)
}

export function getReadingLocalDateKey(value = '', timezoneOffsetMinutes = new Date().getTimezoneOffset()) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const parsed = new Date(`${normalized}Z`)
  if (Number.isNaN(parsed.getTime())) return toDateOnly(raw)
  const localTime = new Date(parsed.getTime() - (timezoneOffsetMinutes * 60 * 1000))
  return formatDateKey(localTime, true)
}

export function getBrineReadingStatus(tank = {}, today = getTodayDateKey()) {
  const saltLevel = Number(tank?.salt_level || 0)
  const updatedAt = getReadingLocalDateKey(tank?.salt_level_updated_at)
  const minSalt = tank?.min_salt_level_for_harvest != null
    ? Number(tank.min_salt_level_for_harvest)
    : null

  if (!saltLevel || !updatedAt) return { kind: 'missing', label: 'Sin lectura' }
  if (updatedAt !== today) return { kind: 'stale', label: 'Lectura vencida' }
  if (minSalt != null && saltLevel < minSalt) return { kind: 'low', label: 'Sal baja' }
  return { kind: 'ok', label: 'Al dia' }
}

export function validateBrineReadingInput({ saltLevel, brineTemp } = {}) {
  const errors = {}
  const salt = Number(saltLevel)
  if (String(saltLevel || '').trim() === '') errors.saltLevel = 'Captura el nivel de sal'
  else if (!Number.isFinite(salt) || salt <= 0) errors.saltLevel = 'Ingresa un valor valido'

  const tempRaw = String(brineTemp || '').trim()
  if (tempRaw !== '' && !Number.isFinite(Number(tempRaw))) errors.brineTemp = 'Ingresa una temperatura valida'
  return errors
}

export function buildBrineReadingPayload({ machineId, saltLevel, brineTemp } = {}) {
  const payload = {
    machine_id: Number(machineId || 0),
    salt_level: Number(saltLevel || 0),
  }
  if (String(brineTemp || '').trim() !== '') payload.brine_temp = Number(brineTemp)
  return payload
}

export function getInitialBrineReadingForm(tank = {}) {
  return {
    machineId: tank?.id || 0,
    saltLevel: tank?.salt_level ? String(tank.salt_level) : '',
    brineTemp: tank?.brine_temp ? String(tank.brine_temp) : '',
  }
}
