// incidentService.js — Consolidacion Fase 11
// Servicio centralizado de incidentes de produccion (gf.production.incident).
// Capa unica entre las pantallas y productionAPI.js.
//
// CONTRATO BACKEND CONFIRMADO (via BFF → readModelSorted/createUpdate):
//   Campos READ:  id, name, description, incident_type, severity, state,
//                 shift_id, reported_by_id, create_date
//   Campos WRITE (create): shift_id, name, description, incident_type,
//                           severity, state(='open'), reported_by_id
//   Campos WRITE (resolve): state(='resolved') — SOLO ESTE
//
// CAMPOS NO CONFIRMADOS (no se escriben):
//   resolution, resolved_at, resolved_by_id
//   → Pendiente que Sebastian confirme si existen en gf.production.incident
//
// TIPOS Y SEVERIDADES: definidos en frontend, NO validados contra backend.
//   Si Odoo tiene selection fields distintos, el write puede fallar.
//   safeSelectionValue() protege contra mismatch enviando un fallback seguro.
//   REQUIERE CONFIRMACION con Sebastian antes de considerar estos valores finales.
//
// Consumido por: ScreenControlTurno, ScreenHandoverTurno.

import { getIncidents, createIncident, resolveIncident } from './productionAPI'

// ─── Tipos y severidades ────────────────────────────────────────────────────
// IMPORTANTE: Estos valores son ASUMIDOS desde frontend.
// NO estan validados contra los selection fields reales de gf.production.incident.
// Si Odoo tiene valores distintos, el create puede fallar silenciosamente.
//
// REQUIERE CONFIRMACION CON BACKEND:
//   - incident_type: ¿coinciden 'production','quality','inventory','equipment','safety','other'?
//   - severity: ¿coinciden 'low','medium','high'?
//   - state: ¿coinciden 'open','resolved'? ¿hay mas estados?
//
// Si hay mismatch, Odoo rechaza el write con "Value not in selection".
// El helper safeSelectionValue() abajo protege contra esto.

export const INCIDENT_TYPES = [
  { value: 'production', label: 'Produccion' },
  { value: 'quality', label: 'Calidad' },
  { value: 'inventory', label: 'Inventario' },
  { value: 'equipment', label: 'Equipo' },
  { value: 'safety', label: 'Seguridad' },
  { value: 'other', label: 'Otro' },
]

export const INCIDENT_SEVERITIES = [
  { value: 'low', label: 'Baja', color: '#94a3b8' },
  { value: 'medium', label: 'Media', color: '#f59e0b' },
  { value: 'high', label: 'Alta', color: '#ef4444' },
]

export const INCIDENT_STATES = {
  open: { label: 'Abierta', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  resolved: { label: 'Resuelta', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
}

// Sets para validacion rapida
const VALID_TYPES = new Set(INCIDENT_TYPES.map(t => t.value))
const VALID_SEVERITIES = new Set(INCIDENT_SEVERITIES.map(s => s.value))

/**
 * Valida un valor de selection contra los valores conocidos en frontend.
 * Si no coincide, retorna el fallback (evita que Odoo rechace el write).
 *
 * @param {string} value — valor a validar
 * @param {Set} validSet — set de valores validos
 * @param {string} fallback — valor por defecto si no coincide
 * @returns {string}
 */
function safeSelectionValue(value, validSet, fallback) {
  return validSet.has(value) ? value : fallback
}

// ─── Funciones ──────────────────────────────────────────────────────────────

/**
 * Carga incidentes del turno desde Odoo.
 * @param {number} shiftId
 * @returns {Promise<Array>}
 */
export async function loadIncidents(shiftId) {
  if (!shiftId) return []
  try {
    const result = await getIncidents(shiftId)
    return Array.isArray(result) ? result : []
  } catch {
    return []
  }
}

/**
 * Registra un nuevo incidente de produccion.
 * @param {object} params
 * @param {number} params.shift_id
 * @param {string} params.name — titulo breve
 * @param {string} [params.description] — detalle
 * @param {string} [params.incident_type] — production|quality|inventory|equipment|safety|other
 * @param {string} [params.severity] — low|medium|high
 * @param {number} [params.reported_by_id]
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function registerIncident(params) {
  if (!params?.shift_id) return { ok: false, error: 'shift_id requerido' }
  if (!params?.name?.trim()) return { ok: false, error: 'Titulo requerido' }

  try {
    const result = await createIncident({
      shift_id: params.shift_id,
      name: params.name.trim(),
      description: params.description || '',
      incident_type: safeSelectionValue(params.incident_type, VALID_TYPES, 'other'),
      severity: safeSelectionValue(params.severity, VALID_SEVERITIES, 'low'),
      reported_by_id: params.reported_by_id || undefined,
    })
    if (result?.success) return { ok: true }
    return { ok: false, error: result?.error || 'Error registrando incidencia' }
  } catch (e) {
    return { ok: false, error: e.message || 'Error de conexion' }
  }
}

/**
 * Marca un incidente como resuelto.
 * Solo cambia state → 'resolved'. No envia campos no confirmados.
 *
 * @param {number} incidentId
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function markIncidentResolved(incidentId) {
  if (!incidentId) return { ok: false, error: 'incident_id requerido' }

  try {
    const result = await resolveIncident(incidentId)
    if (result?.success) return { ok: true }
    return { ok: false, error: result?.error || 'Error resolviendo incidencia' }
  } catch (e) {
    return { ok: false, error: e.message || 'Error de conexion' }
  }
}

/**
 * Helpers para UI.
 */
export function getOpenIncidents(incidents) {
  return (incidents || []).filter(i => i.state === 'open')
}

/**
 * Retorna label legible para la severidad.
 * Si el backend devuelve un valor no conocido, muestra el valor crudo
 * (tolerancia a mismatch de selection values).
 */
export function getIncidentSeverityLabel(severity) {
  return INCIDENT_SEVERITIES.find(s => s.value === severity)?.label || severity || '—'
}

/**
 * Retorna label legible para el tipo de incidente.
 * Si el backend devuelve un valor no conocido, muestra el valor crudo.
 */
export function getIncidentTypeLabel(type) {
  return INCIDENT_TYPES.find(t => t.value === type)?.label || type || '—'
}
