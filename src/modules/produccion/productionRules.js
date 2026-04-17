// productionRules.js — Reglas de blindaje operativo Fase 1 (frontend)
// Centraliza umbrales, validaciones y mensajes para cierre de turno,
// ciclos Rolito, energia, merma y transformacion.
//
// Definiciones funcionales confirmadas:
//   - Rolito: 650 kg por ciclo. Minimo 85% = 552.5 kg. Maximo +20% = 780 kg.
//     Fuera de rango requiere validacion supervisor/gerente.
//   - Merma tolerada: max 1% del producido del turno.
//   - Cierre de turno: solo supervisor/gerente, con checklist obligatorio.
//   - Energia: lectura inicio y fin obligatorias, fin > inicio, no negativos.
//   - Paros: deben estar cerrados (end_time) antes del cierre de turno.
//   - Transformacion: entrada ≈ salida + merma (diferencia = incidencia).

// ─── Umbrales Rolito ────────────────────────────────────────────────────────
export const ROLITO_KG_TARGET = 650
export const ROLITO_KG_MIN = 552.5   // 85% del target (merma aceptable)
export const ROLITO_KG_MAX = 780     // +20% del target (limite fisico)

// ─── Umbrales merma ─────────────────────────────────────────────────────────
export const MERMA_MAX_PCT = 1.0     // max 1% del producido del turno

// ─── Balance transformacion ────────────────────────────────────────────────
export const TRANSFORM_BALANCE_TOLERANCE_PCT = 2.0 // diferencia ≤ 2% aceptable

// ─── Validacion Rolito kg_dumped ────────────────────────────────────────────
/**
 * Valida kg_dumped como ADVISORY UX (NO autoridad de rechazo).
 *
 * Backend (gf.evaporator.cycle en Sebastian's repo) solo enforza kg_dumped > 0
 * via _check_kg_dumped_positive (gf_production_ops_fix). NO hay validacion de
 * rango min/max en backend. Este helper existe para informar al operador,
 * NO para bloquear el dump.
 *
 * - `ok: false` solo cuando kg <= 0 (el backend tambien rechazara).
 * - Fuera de rango operativo → `level: 'warning'`, `ok: true` (no bloquea).
 * - `requiresOverride` queda SIEMPRE en false para respetar la regla
 *   backend-first. La UI puede pedir confirmacion/firma supervisor pero
 *   no rechazar la sumbision.
 *
 * @param {number} kg  kilogramos producidos en el ciclo
 * @param {object} [config]  umbrales por-ciclo/maquina (target, min, max).
 * @returns {{ ok: boolean, level: 'ok'|'warning'|'error', reason: string, requiresOverride: boolean }}
 */
export function validateRolitoKg(kg, config) {
  const n = Number(kg)
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, level: 'error', reason: 'Ingresa kg producidos (mayor a 0)', requiresOverride: false }
  }
  const target = Number(config?.target) > 0 ? Number(config.target) : ROLITO_KG_TARGET
  const min = Number(config?.min) > 0
    ? Number(config.min)
    : (config?.target > 0 ? Math.round(target * 0.85 * 10) / 10 : ROLITO_KG_MIN)
  const max = Number(config?.max) > 0
    ? Number(config.max)
    : (config?.target > 0 ? Math.round(target * 1.20) : ROLITO_KG_MAX)

  if (n < min) {
    return {
      ok: true,
      level: 'warning',
      reason: `Inusual: bajo minimo operativo (${min} kg). Se registra tal cual.`,
      requiresOverride: false,
    }
  }
  if (n > max) {
    return {
      ok: true,
      level: 'warning',
      reason: `Inusual: sobre maximo fisico (${max} kg). Se registra tal cual.`,
      requiresOverride: false,
    }
  }
  if (n < target * 0.95 || n > target * 1.05) {
    return {
      ok: true,
      level: 'warning',
      reason: `Fuera del rango ideal (${Math.round(target * 0.95)}–${Math.round(target * 1.05)} kg)`,
      requiresOverride: false,
    }
  }
  return { ok: true, level: 'ok', reason: '', requiresOverride: false }
}

// ─── Validacion Energia ─────────────────────────────────────────────────────
/**
 * Valida lecturas de energia (inicio y fin).
 * @returns {{ ok: boolean, errors: string[], consumption: number|null }}
 */
export function validateEnergyReadings(startReading, endReading) {
  const errors = []
  if (!startReading) errors.push('Falta lectura de inicio de turno')
  if (!endReading) errors.push('Falta lectura de fin de turno')

  let consumption = null
  if (startReading && endReading) {
    const s = Number(startReading.kwh_value)
    const e = Number(endReading.kwh_value)
    if (!Number.isFinite(s) || s < 0) errors.push('Lectura inicio invalida')
    if (!Number.isFinite(e) || e < 0) errors.push('Lectura fin invalida')
    if (Number.isFinite(s) && Number.isFinite(e)) {
      if (e < s) errors.push(`Fin (${e}) menor que inicio (${s}) — revisar secuencia`)
      consumption = e - s
    }

    // Validar orden temporal (si hay created_at)
    if (startReading.created_at && endReading.created_at) {
      try {
        const ta = new Date(String(startReading.created_at).replace(' ', 'T')).getTime()
        const tb = new Date(String(endReading.created_at).replace(' ', 'T')).getTime()
        if (tb < ta) errors.push('Lectura fin registrada antes que la de inicio')
      } catch { /* ignore */ }
    }
  }

  return { ok: errors.length === 0, errors, consumption }
}

// ─── Validacion Merma vs Produccion ─────────────────────────────────────────
/**
 * Valida merma total contra produccion del turno.
 * @returns {{ level: 'ok'|'warning'|'error', pct: number, message: string }}
 */
export function validateMermaVsProduction(totalMermaKg, totalProducedKg) {
  const merma = Number(totalMermaKg) || 0
  const produced = Number(totalProducedKg) || 0
  if (produced <= 0) {
    return { level: merma > 0 ? 'warning' : 'ok', pct: 0, message: merma > 0 ? 'Merma sin produccion registrada' : '' }
  }
  const pct = (merma / produced) * 100
  if (pct > MERMA_MAX_PCT) {
    return {
      level: 'error',
      pct,
      message: `Merma ${pct.toFixed(2)}% supera maximo (${MERMA_MAX_PCT}%)`,
    }
  }
  if (pct > MERMA_MAX_PCT * 0.7) {
    return {
      level: 'warning',
      pct,
      message: `Merma ${pct.toFixed(2)}% cerca del limite (${MERMA_MAX_PCT}%)`,
    }
  }
  return { level: 'ok', pct, message: '' }
}

// ─── Validacion Balance Transformacion ──────────────────────────────────────
/**
 * Valida que entrada ≈ salida + merma.
 * @returns {{ ok: boolean, level: 'ok'|'warning'|'error', diffKg: number, diffPct: number, message: string }}
 */
export function validateTransformBalance(inputKg, outputKg, scrapKg) {
  const inp = Number(inputKg) || 0
  const out = Number(outputKg) || 0
  const scr = Number(scrapKg) || 0
  if (inp <= 0) return { ok: false, level: 'error', diffKg: 0, diffPct: 0, message: 'Entrada requerida' }

  const expected = out + scr
  const diffKg = expected - inp
  const diffPct = (Math.abs(diffKg) / inp) * 100

  if (diffPct <= TRANSFORM_BALANCE_TOLERANCE_PCT) {
    return { ok: true, level: 'ok', diffKg, diffPct, message: 'Balance correcto' }
  }
  if (diffPct <= TRANSFORM_BALANCE_TOLERANCE_PCT * 2) {
    return {
      ok: false, level: 'warning', diffKg, diffPct,
      message: `Diferencia ${diffKg > 0 ? '+' : ''}${diffKg.toFixed(1)} kg (${diffPct.toFixed(1)}%) — revisar`,
    }
  }
  return {
    ok: false, level: 'error', diffKg, diffPct,
    message: `Desbalance critico: ${diffKg > 0 ? '+' : ''}${diffKg.toFixed(1)} kg (${diffPct.toFixed(1)}%)`,
  }
}

// ─── Validacion Cierre de Turno ─────────────────────────────────────────────
// ELIMINADA en Fase 6 (abril 2026).
// evaluateShiftCloseReadiness() fue reemplazada por _get_close_readiness()
// en Odoo. El backend es la unica fuente de verdad para readiness de cierre.
// Ver: shiftReadiness.js → getCloseReadiness() → /api/production/shift/close-check
