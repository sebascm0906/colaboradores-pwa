// reconciliationPT.js — Consolidacion Fase 11
// Helper para reconciliacion de inventario con Almacen PT.
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ ESTADO: BACKEND REAL (Odoo controller)                              │
// │   - Endpoint: POST /api/production/pt/reconcile                    │
// │   - Request:  { shift_id, plant_id?, manual: { pt_received_kg? } } │
// │   - Response: { manual, system, differences, incidents, consistent }│
// │                                                                     │
// │ Backend calcula la verdad del sistema.                              │
// │ Frontend NO recalcula produced_kg, packed_kg, scrap_kg, etc.       │
// │                                                                     │
// │ localStorage mantiene cache de la ultima respuesta como respaldo.  │
// └─────────────────────────────────────────────────────────────────────┘

import { reconcileInventoryPT } from './supervisorAuth'

const RECONCILIATION_KEY = 'gfsc.reconciliation.v1'

// ═══════════════════════════════════════════════════════════════════════════════
// Envio al backend (endpoint real)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Envia reconciliacion al backend y cachea la respuesta localmente.
 *
 * @param {object} payload — { shift_id, plant_id?, manual?: { pt_received_kg? } }
 * @returns {Promise<{ok: boolean, sent: boolean, data?: object, error?: string}>}
 */
export async function submitReconciliation(payload) {
  if (!payload?.shift_id) {
    return { ok: false, sent: false, error: 'shift_id requerido' }
  }

  const result = await reconcileInventoryPT(payload)

  if (result.ok && result.data) {
    // Backend acepto — cachear respuesta localmente como respaldo
    saveCachedReconciliation(payload.shift_id, result.data)
    return { ok: true, sent: true, data: result.data }
  }

  return {
    ok: false,
    sent: false,
    error: result.error || 'Error en reconciliacion',
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cache local (respaldo de la ultima respuesta del backend)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cachea la respuesta del backend en localStorage (respaldo).
 */
function saveCachedReconciliation(shiftId, data) {
  try {
    const key = `${RECONCILIATION_KEY}.${shiftId}`
    localStorage.setItem(key, JSON.stringify({ ...data, cached_at: new Date().toISOString() }))
  } catch { /* localStorage full o no disponible */ }
}

/**
 * Lee reconciliacion cacheada de localStorage.
 */
export function getCachedReconciliation(shiftId) {
  try {
    const raw = localStorage.getItem(`${RECONCILIATION_KEY}.${shiftId}`)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

/**
 * Limpia reconciliacion cacheada de localStorage.
 */
export function clearCachedReconciliation(shiftId) {
  try {
    localStorage.removeItem(`${RECONCILIATION_KEY}.${shiftId}`)
  } catch { /* noop */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy exports — mantener compatibilidad temporal
// TODO: eliminar cuando las pantallas migren al flujo canonico
// ═══════════════════════════════════════════════════════════════════════════════

/** @deprecated Use getCachedReconciliation */
export const getPendingReconciliation = getCachedReconciliation

/** @deprecated Use clearCachedReconciliation */
export function getAllPendingReconciliations() {
  const pending = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(RECONCILIATION_KEY)) {
        const data = JSON.parse(localStorage.getItem(key))
        if (data) pending.push(data)
      }
    }
  } catch { /* noop */ }
  return pending
}
