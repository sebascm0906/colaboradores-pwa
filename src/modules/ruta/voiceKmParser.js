// ─── voiceKmParser — Parseo de kilómetros desde transcript de voz ────────────
// Piloto: /ruta/cierre. Toma el transcript libre del envelope W120 y extrae
// {departure_km, arrival_km}. Nunca persiste nada. Nunca cierra ruta.
//
// Reglas (alineadas con el spec del piloto):
//   - Detectamos números enteros de 2 a 7 dígitos.
//   - Si encontramos KEYWORDS de salida/llegada cerca de un número, asociamos
//     ese número a ese campo.
//   - Si no hay keywords pero hay exactamente 2 números, asignamos en orden:
//     primero salida, segundo llegada.
//   - Si hay 1 número sin keyword, no adivinamos: pedimos al usuario que
//     complete manualmente.
//   - Si hay >2 números sin contexto inequívoco, marcamos ambiguo.
//   - Validación: enteros positivos, llegada >= salida, rango razonable.
// ─────────────────────────────────────────────────────────────────────────────

const SALIDA_KEYWORDS = [
  'salida', 'salgo', 'sali', 'salí',
  'inicial', 'inicio', 'partida', 'comienzo', 'arranque', 'parto',
]
const LLEGADA_KEYWORDS = [
  'llegada', 'llegue', 'llegué', 'llegando',
  'final', 'cierre', 'termino', 'término', 'fin', 'arribo', 'cerré',
]

const MIN_KM = 1
const MAX_KM = 9_999_999  // 7 dígitos

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function findNumberNearKeyword(text, keywords) {
  // Buscamos: keyword opcionalmente seguida de palabras de relleno y luego número
  // Ej: "salida 12345", "salí con 12345", "kilómetro inicial es 12345"
  for (const kw of keywords) {
    const re = new RegExp(`\\b${kw}\\b[^\\d]{0,30}(\\d{2,7})`, 'i')
    const m = text.match(re)
    if (m) return Number(m[1])
  }
  return null
}

function validateValues(dep, arr) {
  if (!Number.isInteger(dep) || dep < MIN_KM || dep > MAX_KM) {
    return { ok: false, reason: 'invalid_departure', message: `Km de salida ${dep} fuera de rango.` }
  }
  if (!Number.isInteger(arr) || arr < MIN_KM || arr > MAX_KM) {
    return { ok: false, reason: 'invalid_arrival', message: `Km de llegada ${arr} fuera de rango.` }
  }
  if (arr < dep) {
    return {
      ok: false,
      reason: 'arrival_less_than_departure',
      message: 'El km de llegada no puede ser menor al km de salida.',
    }
  }
  return { ok: true, departure_km: dep, arrival_km: arr }
}

/**
 * Parsea un envelope o transcript de voz y devuelve los km detectados.
 *
 * @param {object|string} input - Envelope W120 o transcript string
 * @returns {{
 *   ok: boolean,
 *   partial?: boolean,
 *   reason?: string,
 *   message: string,
 *   departure_km?: number|null,
 *   arrival_km?: number|null,
 *   source?: 'keywords'|'order'|'envelope_data',
 *   transcript: string,
 * }}
 */
export function parseKmFromVoice(input) {
  // Aceptar envelope completo o transcript directo (para tests)
  let transcript = ''
  let envelopeData = null
  if (typeof input === 'string') {
    transcript = input
  } else if (input && typeof input === 'object') {
    transcript = input?.meta?.transcript
      || input?.data?.transcript
      || input?.transcript
      || ''
    envelopeData = input?.data || null
  }
  transcript = String(transcript || '').trim()

  // Opción A: envelope estructurado con departure_km/arrival_km explícitos.
  // (Hoy ningún context_id devuelve eso, pero aceptamos por si W120 lo expone.)
  if (envelopeData && (envelopeData.departure_km != null || envelopeData.arrival_km != null)) {
    const dep = Math.round(Number(envelopeData.departure_km))
    const arr = Math.round(Number(envelopeData.arrival_km))
    if (Number.isFinite(dep) && Number.isFinite(arr)) {
      const v = validateValues(dep, arr)
      if (v.ok) {
        return {
          ok: true, partial: false, departure_km: dep, arrival_km: arr,
          source: 'envelope_data', transcript,
          message: `Entendí: salida ${dep}, llegada ${arr}.`,
        }
      }
      return { ...v, transcript }
    }
  }

  // Opción B: transcript libre.
  if (!transcript) {
    return { ok: false, reason: 'empty_transcript', transcript,
      message: 'No detecté voz. Intenta de nuevo.' }
  }

  const text = normalize(transcript)
  const allMatches = text.match(/\b\d{2,7}\b/g) || []
  const numbers = allMatches.map(Number).filter(n => n >= MIN_KM && n <= MAX_KM)

  if (numbers.length === 0) {
    return { ok: false, reason: 'no_numbers', transcript,
      message: 'No detecté kilómetros. Intenta de nuevo.' }
  }

  const salidaByKw = findNumberNearKeyword(text, SALIDA_KEYWORDS)
  const llegadaByKw = findNumberNearKeyword(text, LLEGADA_KEYWORDS)

  // Caso 1: ambos campos por keyword (independiente de cuántos números haya)
  if (salidaByKw != null && llegadaByKw != null) {
    const v = validateValues(salidaByKw, llegadaByKw)
    if (!v.ok) return { ...v, transcript }
    return {
      ok: true, partial: false,
      departure_km: salidaByKw, arrival_km: llegadaByKw,
      source: 'keywords', transcript,
      message: `Entendí: salida ${salidaByKw}, llegada ${llegadaByKw}.`,
    }
  }

  // Caso 2: solo salida identificada — completar llegada manual
  if (salidaByKw != null && llegadaByKw == null) {
    return {
      ok: true, partial: true,
      departure_km: salidaByKw, arrival_km: null,
      source: 'keywords', transcript,
      message: `Salida ${salidaByKw}. Completa el km de llegada manualmente.`,
    }
  }

  // Caso 3: solo llegada identificada — completar salida manual
  if (llegadaByKw != null && salidaByKw == null) {
    return {
      ok: true, partial: true,
      departure_km: null, arrival_km: llegadaByKw,
      source: 'keywords', transcript,
      message: `Llegada ${llegadaByKw}. Completa el km de salida manualmente.`,
    }
  }

  // Caso 4: sin keywords pero exactamente 2 números → orden lógico
  if (numbers.length === 2) {
    const v = validateValues(numbers[0], numbers[1])
    if (!v.ok) return { ...v, transcript }
    return {
      ok: true, partial: false,
      departure_km: numbers[0], arrival_km: numbers[1],
      source: 'order', transcript,
      message: `Entendí: salida ${numbers[0]}, llegada ${numbers[1]}.`,
    }
  }

  // Caso 5: 1 solo número sin keyword → no adivinamos
  if (numbers.length === 1) {
    return {
      ok: false, reason: 'single_number_no_keyword', transcript,
      message: `Detecté ${numbers[0]} pero no sé si es salida o llegada. Repite con "salida" o "llegada".`,
    }
  }

  // Caso 6: >2 números sin keywords claros → ambiguo
  return {
    ok: false, reason: 'ambiguous_multiple_numbers', transcript,
    message: 'Detecté varios números. Captura los kilómetros manualmente.',
  }
}
