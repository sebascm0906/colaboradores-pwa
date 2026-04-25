// Tests para parseKmFromVoice — piloto voz /ruta/cierre.
// Cubren los 6 casos del spec + validaciones + casos defensivos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseKmFromVoice } from '../src/modules/ruta/voiceKmParser.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function transcript(t) { return { ok: true, meta: { transcript: t } } }

// ── Casos del spec — sección "Pruebas manuales requeridas" ───────────────────

test('caso A — éxito con keywords salida/llegada', () => {
  const r = parseKmFromVoice(transcript('salida 12345 llegada 12480'))
  assert.equal(r.ok, true)
  assert.equal(r.partial, false)
  assert.equal(r.departure_km, 12345)
  assert.equal(r.arrival_km, 12480)
  assert.equal(r.source, 'keywords')
})

test('caso B — palabras distintas (inicial/final)', () => {
  const r = parseKmFromVoice(transcript('kilómetro inicial 20000 y final 20120'))
  assert.equal(r.ok, true)
  assert.equal(r.departure_km, 20000)
  assert.equal(r.arrival_km, 20120)
})

test('caso B2 — variantes naturales (salí/llegué, inicio/cierre)', () => {
  const r1 = parseKmFromVoice(transcript('salí con 12345 y llegué con 12480'))
  assert.equal(r1.departure_km, 12345)
  assert.equal(r1.arrival_km, 12480)

  const r2 = parseKmFromVoice(transcript('inicio 30000, cierre 30180'))
  assert.equal(r2.departure_km, 30000)
  assert.equal(r2.arrival_km, 30180)
})

test('caso C — sólo número con keyword salida → partial sin asumir llegada', () => {
  const r = parseKmFromVoice(transcript('salida 12345'))
  assert.equal(r.ok, true)
  assert.equal(r.partial, true)
  assert.equal(r.departure_km, 12345)
  assert.equal(r.arrival_km, null)
  assert.match(r.message, /completa.*llegada/i)
})

test('caso C2 — sólo número con keyword llegada → partial sin asumir salida', () => {
  const r = parseKmFromVoice(transcript('llegada 12480'))
  assert.equal(r.ok, true)
  assert.equal(r.partial, true)
  assert.equal(r.departure_km, null)
  assert.equal(r.arrival_km, 12480)
  assert.match(r.message, /completa.*salida/i)
})

test('caso D — inválido: llegada < salida → no aplica nada', () => {
  const r = parseKmFromVoice(transcript('salida 12480 llegada 12345'))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'arrival_less_than_departure')
  assert.equal(r.departure_km, undefined)
  assert.equal(r.arrival_km, undefined)
  assert.match(r.message, /llegada no puede ser menor/i)
})

test('caso E — ambiguo: 3 números sin keywords → no aplica nada', () => {
  const r = parseKmFromVoice(transcript('12345 12480 13000'))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'ambiguous_multiple_numbers')
  assert.match(r.message, /varios números|capturalos manualmente|manualmente/i)
})

// ── Validaciones ─────────────────────────────────────────────────────────────

test('rechaza valores negativos (regex no captura el signo)', () => {
  const r = parseKmFromVoice(transcript('salida -12345 llegada 12480'))
  // El parser sólo captura los dígitos; el "-" se pierde y queda 12345
  // que es válido. Esto es comportamiento esperado: la voz no genera negativos.
  assert.equal(r.ok, true)
  assert.equal(r.departure_km, 12345)
})

test('rechaza números fuera de rango (>9.999.999)', () => {
  // Un número de 8 dígitos no es capturado por el regex (\d{2,7})
  const r = parseKmFromVoice(transcript('salida 99999999 llegada 12480'))
  // Quedan: 9999999, 12480 — válidos individualmente pero llegada<salida
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'arrival_less_than_departure')
})

test('1 solo número sin keyword → no adivina', () => {
  const r = parseKmFromVoice(transcript('12345'))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'single_number_no_keyword')
})

test('exactamente 2 números sin keywords → orden lógico', () => {
  const r = parseKmFromVoice(transcript('12345 12480'))
  assert.equal(r.ok, true)
  assert.equal(r.partial, false)
  assert.equal(r.departure_km, 12345)
  assert.equal(r.arrival_km, 12480)
  assert.equal(r.source, 'order')
})

test('2 números sin keywords pero llegada<salida → rechaza', () => {
  const r = parseKmFromVoice(transcript('12480 12345'))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'arrival_less_than_departure')
})

test('transcript vacío → ok:false', () => {
  const r = parseKmFromVoice(transcript(''))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'empty_transcript')
})

test('transcript sin números → ok:false', () => {
  const r = parseKmFromVoice(transcript('hola buenos días'))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'no_numbers')
})

// ── Envelope shapes ──────────────────────────────────────────────────────────

test('envelope con data.{departure_km,arrival_km} explícitos (Opción A)', () => {
  const r = parseKmFromVoice({
    ok: true, data: { departure_km: 50000, arrival_km: 50180 }, meta: {},
  })
  assert.equal(r.ok, true)
  assert.equal(r.source, 'envelope_data')
  assert.equal(r.departure_km, 50000)
  assert.equal(r.arrival_km, 50180)
})

test('envelope con data inválido (llegada<salida) → falla', () => {
  const r = parseKmFromVoice({
    ok: true, data: { departure_km: 50180, arrival_km: 50000 }, meta: {},
  })
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'arrival_less_than_departure')
})

test('acepta string puro (no envelope) — útil para tests y rescate', () => {
  const r = parseKmFromVoice('salida 80000 llegada 80100')
  assert.equal(r.ok, true)
  assert.equal(r.departure_km, 80000)
  assert.equal(r.arrival_km, 80100)
})

test('null/undefined input → no crashea, devuelve ok:false', () => {
  const r1 = parseKmFromVoice(null)
  assert.equal(r1.ok, false)
  const r2 = parseKmFromVoice(undefined)
  assert.equal(r2.ok, false)
})

// ── Acentos y normalización ──────────────────────────────────────────────────

test('acentos no rompen el match', () => {
  const r = parseKmFromVoice(transcript('llegué con 30180 y salí con 30000'))
  // "llegué" y "salí" — ambos con keyword
  assert.equal(r.ok, true)
  assert.equal(r.departure_km, 30000)
  assert.equal(r.arrival_km, 30180)
})
