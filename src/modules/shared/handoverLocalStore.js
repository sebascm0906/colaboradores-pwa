// handoverLocalStore.js — Persistencia local del handover de turno
// Hardening Fase 7/9, consolidacion Fase 11.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ DOMINIO: LOGISTICA (NO produccion)                                  │
// │ Este modulo NO se integra con produccion backend.                  │
// │ La integracion con /gf/logistics/api/.../shift_handover/ es scope  │
// │ de una fase separada de logistica.                                 │
// │                                                                     │
// │ ESTADO: SOLO LOCAL (localStorage)                                   │
// │   - Endpoint /api/production/handover → NO EXISTE                  │
// │   - submitHandover() SIEMPRE cae a fallback localStorage           │
// │   - Datos son TEMPORALES y solo existen en este dispositivo        │
// │                                                                     │
// │ Cuando se implemente la fase de logistica, submitHandover()        │
// │ enviara al backend y marcara el registro local como synced.        │
// └─────────────────────────────────────────────────────────────────────┘

const STORAGE_KEY = 'gfsc.handover.v1'

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* quota exceeded etc. */ }
}

/**
 * Retorna el handover guardado localmente para un turno.
 * Shape alineado al futuro modelo gf.shift.handover.
 */
export function getHandoverLocal(shiftId) {
  if (!shiftId) return null
  const all = readAll()
  return all[String(shiftId)] || null
}

/**
 * Guarda/actualiza el handover local de un turno.
 * @param {number} shiftId
 * @param {object} data — { inventory_snapshot, production_summary,
 *                          incidents, pending_tasks, signature_from,
 *                          signature_to, signed, signed_at, notes }
 */
export function saveHandoverLocal(shiftId, data) {
  if (!shiftId) return
  const all = readAll()
  const prev = all[String(shiftId)] || {}
  all[String(shiftId)] = {
    ...prev,
    ...data,
    shift_id: shiftId,
    updated_at: new Date().toISOString(),
  }
  writeAll(all)
  return all[String(shiftId)]
}

export function clearHandoverLocal(shiftId) {
  if (!shiftId) return
  const all = readAll()
  delete all[String(shiftId)]
  writeAll(all)
}

/**
 * Payload listo para enviar al endpoint /api/production/handover (futuro).
 * Shape 1:1 con gf.shift.handover (campos mapeados al modelo Odoo).
 */
export function buildHandoverPayload(local) {
  if (!local) return null
  return {
    shift_id: local.shift_id,
    inventory_snapshot: local.inventory_snapshot || [],
    production_summary: local.production_summary || {},
    incidents: local.incidents || '',
    pending_tasks: local.pending_tasks || '',
    signature_from: local.signature_from || '',
    signature_to: local.signature_to || '',
    signed: Boolean(local.signed),
    signed_at: local.signed_at || null,
    notes: local.notes || '',
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fase 4 — Servicio de envio al backend (listo para cuando exista el endpoint)
// ═══════════════════════════════════════════════════════════════════════════════

import { api, ApiError } from '../../lib/api'

/**
 * Intenta enviar handover al backend. Si el endpoint no existe,
 * guarda en localStorage y retorna fallback: true.
 *
 * Cuando gf.shift.handover + /api/production/handover existan,
 * esta funcion enviara al servidor sin cambios en las pantallas.
 *
 * Deteccion de endpoint inexistente usa ApiError.status y ApiError.code
 * en lugar de parsear mensajes de error con regex.
 *
 * @param {number} shiftId
 * @param {object} data — mismo shape que saveHandoverLocal recibe
 * @returns {Promise<{ok: boolean, sent: boolean, fallback?: boolean}>}
 */
export async function submitHandover(shiftId, data) {
  if (!shiftId) return { ok: false, sent: false, error: 'shift_id requerido' }

  // Siempre guardar localmente primero (respaldo)
  saveHandoverLocal(shiftId, data)

  // Intentar enviar al backend
  try {
    const payload = buildHandoverPayload({ ...data, shift_id: shiftId })
    const result = await api('POST', '/api/production/handover', payload)
    if (result && !result.error) {
      // Backend acepto — marcar local como sincronizado
      saveHandoverLocal(shiftId, { ...data, synced: true, synced_at: new Date().toISOString() })
      return { ok: true, sent: true }
    }
  } catch (e) {
    // Endpoint no existe o no hay conexion → localStorage es suficiente
    if (!isEndpointUnavailable(e)) {
      console.error('[handover] Error enviando al backend:', e.message)
    }
  }

  return { ok: true, sent: false, fallback: true }
}

/**
 * Determina si un error indica que el endpoint no existe o no esta disponible.
 * Usa propiedades estructuradas de ApiError (status, code) en lugar de regex.
 */
function isEndpointUnavailable(e) {
  if (e instanceof ApiError) {
    return e.status === 404 || e.code === 'bypass' || e.code === 'network'
  }
  if (e instanceof TypeError) return true
  return false
}
