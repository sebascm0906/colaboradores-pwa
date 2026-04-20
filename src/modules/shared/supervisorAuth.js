// supervisorAuth.js — Consolidacion Fase 11
// Autenticacion de supervisor, cierre de turno, reconciliacion PT.
// Todo backend-first: sin fallbacks, sin calculo local.
//
// Endpoints:
//   /api/production/validate-pin  → PIN hash hr.employee
//   /api/production/shift/close   → action_close_shift
//   /api/production/pt/reconcile  → reconciliacion PT (backend calcula)

import { validatePin } from './productionAPI'
import { api } from '../../lib/api'

// ─── PIN Supervisor ──────────────────────────────────────────────────────────

/**
 * Valida el PIN del supervisor contra Odoo.
 * No hay fallback local — si el backend rechaza, se bloquea.
 *
 * @param {string} pin
 * @param {number} [employeeId]
 * @returns {Promise<{ok: boolean, employee_id?: number, employee_name?: string, error?: string}>}
 */
export async function validateSupervisorPin(pin, employeeId) {
  if (!pin || String(pin).length < 4) {
    return { ok: false, error: 'PIN requerido (minimo 4 digitos)' }
  }

  try {
    const result = await validatePin(pin, employeeId)
    if (result?.ok) {
      return {
        ok: true,
        employee_id: result.employee_id,
        employee_name: result.employee_name,
      }
    }
    return { ok: false, error: result?.error || 'PIN incorrecto' }
  } catch (e) {
    return { ok: false, error: translateError(e.message) }
  }
}

// ─── Cierre de turno ─────────────────────────────────────────────────────────

/**
 * Cierra un turno usando el endpoint REST real de Odoo.
 * No hay cadena de fallback — si falla, el error se propaga.
 *
 * @param {object} payload — { shift_id }
 * @returns {Promise<{ok: boolean, warnings?: string[], error?: string}>}
 */
export async function closeShiftServerSide(payload) {
  if (!payload?.shift_id) {
    return { ok: false, error: 'shift_id requerido' }
  }

  try {
    const result = await api('POST', '/pwa-prod/shift-close', { shift_id: payload.shift_id })
    if (result && !result.error) {
      return { ok: true, warnings: result.warnings || [] }
    }
    return { ok: false, error: translateError(result?.error) }
  } catch (e) {
    return { ok: false, error: translateError(e.message) }
  }
}

// ─── Reconciliacion PT ───────────────────────────────────────────────────────
// ESTADO: endpoint /api/production/pt/reconcile EXISTE (Odoo controller real).
// Backend calcula la verdad del sistema. Frontend no recalcula.

import { ptReconcile } from './productionAPI'

/**
 * Reconciliacion de inventario PT via contrato canonico.
 * Request:  { shift_id, plant_id?, manual: { pt_received_kg? } }
 * Response: { manual, system, differences, incidents, consistent }
 *
 * @param {object} payload — { shift_id, plant_id?, manual? }
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export async function reconcileInventoryPT(payload) {
  if (!payload?.shift_id) {
    return { ok: false, error: 'shift_id requerido' }
  }
  try {
    const result = await ptReconcile(payload)
    // El controller retorna la reconciliacion directamente
    if (result && !result.error) {
      return { ok: true, data: result }
    }
    return { ok: false, error: result?.error || 'Error en reconciliacion' }
  } catch (e) {
    return { ok: false, error: e.message || 'Error en reconciliacion' }
  }
}

// ─── Traductor de errores ────────────────────────────────────────────────────

/**
 * Traduce errores tecnicos del backend a mensajes legibles para operadores.
 * NOTA: Esto es un traductor de UX, NO control de flujo.
 * El string matching aqui es aceptable porque solo afecta el mensaje
 * mostrado al usuario, no la logica del sistema.
 */
function translateError(msg) {
  if (!msg) return 'Error de conexion con el servidor'
  const m = String(msg).toLowerCase()
  if (m.includes('no_session') || m.includes('401'))
    return 'Sesion expirada, vuelve a iniciar sesion'
  if (m.includes('balance') || m.includes('threshold') || m.includes('pct'))
    return 'Falta cuadrar produccion antes de cerrar'
  if (m.includes('checklist') || m.includes('haccp'))
    return 'Completa el checklist HACCP antes de cerrar'
  if (m.includes('energy') || m.includes('lectura'))
    return 'Falta la lectura de energia'
  if (m.includes('downtime') || m.includes('paro'))
    return 'Cierra los paros activos antes de cerrar turno'
  if (m.includes('incident'))
    return 'Hay incidencias abiertas sin resolver'
  if (m.includes('handover'))
    return 'Completa la entrega de turno antes de cerrar'
  if (m.includes('pin'))
    return 'PIN incorrecto'
  if (m.includes('has no attribute') || m.includes('not found'))
    return 'Error del servidor, contacta al administrador'
  if (m.includes('failed to fetch') || m.includes('networkerror'))
    return 'Sin conexion al servidor'
  return msg
}
