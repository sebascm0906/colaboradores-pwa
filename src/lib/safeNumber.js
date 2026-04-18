// ─── safeNumber — helper único para parseo numérico en la PWA ────────────────
// Reemplaza todos los patrones inseguros tipo `parseFloat(x) || 0` con
// manejo explícito de NaN, negativos, rangos, y precision.
//
// Uso:
//   safeNumber('12.5')         → 12.5
//   safeNumber('abc')          → 0
//   safeNumber('abc', { fallback: null }) → null
//   safeNumber('-5', { min: 0 }) → 0 (clampeado)
//   safeNumber('999', { max: 100 }) → 100
//   safeNumber('12.567', { precision: 2 }) → 12.57
//   safeNumber.isValid('abc')  → false
//   safeNumber.isValid('12.5') → true
//
// ¿Por qué?
//   - parseFloat('') = NaN; NaN || 0 = 0 (silencia error)
//   - parseFloat('12abc') = 12 (lee parcial; peligroso)
//   - Number('') = 0 (igual de engañoso)
//   - Este helper usa Number() + isFinite() + rangos y devuelve un
//     valor predecible sin sorpresas.

/**
 * Convierte un valor a número de forma segura.
 * @param {*} value - valor a convertir (string, number, null, undefined)
 * @param {object} [options]
 * @param {number} [options.fallback=0] - valor a retornar si no es numérico válido
 * @param {number} [options.min] - valor mínimo (clamp si es menor)
 * @param {number} [options.max] - valor máximo (clamp si es mayor)
 * @param {number} [options.precision] - decimales (redondea)
 * @param {boolean} [options.allowNegative=true] - si false, convierte negativos a fallback
 * @returns {number|null} número limpio, o `fallback` si inválido
 */
export function safeNumber(value, options = {}) {
  const {
    fallback = 0,
    min,
    max,
    precision,
    allowNegative = true,
  } = options

  // null/undefined/empty → fallback
  if (value === null || value === undefined || value === '') return fallback

  // Acepta strings y numbers. Rechaza objects, arrays, booleans.
  const raw = typeof value === 'string' ? value.trim() : value
  if (typeof raw !== 'number' && typeof raw !== 'string') return fallback

  // Number() es más estricto que parseFloat: '12abc' → NaN, no 12
  const n = typeof raw === 'number' ? raw : Number(raw)

  if (!Number.isFinite(n)) return fallback
  if (!allowNegative && n < 0) return fallback

  let clean = n
  if (typeof min === 'number' && clean < min) clean = min
  if (typeof max === 'number' && clean > max) clean = max

  if (typeof precision === 'number' && precision >= 0) {
    const factor = Math.pow(10, precision)
    clean = Math.round(clean * factor) / factor
  }

  return clean
}

/** Devuelve `true` si el valor parsea a un número finito, sin importar signo. */
safeNumber.isValid = function isValid(value) {
  if (value === null || value === undefined || value === '') return false
  const raw = typeof value === 'string' ? value.trim() : value
  if (typeof raw !== 'number' && typeof raw !== 'string') return false
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n)
}

/** Devuelve `true` si el valor es un número estrictamente positivo. */
safeNumber.isPositive = function isPositive(value) {
  const n = safeNumber(value, { fallback: null })
  return typeof n === 'number' && n > 0
}

/** Versión enfocada en enteros (redondea). */
export function safeInt(value, options = {}) {
  const n = safeNumber(value, options)
  return typeof n === 'number' ? Math.trunc(n) : n
}

/** Formateador de moneda MXN usando Intl. */
export function fmtMoney(value, { currency = 'MXN', decimals = 2 } = {}) {
  const n = safeNumber(value, { fallback: 0, precision: decimals })
  return n.toLocaleString('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
