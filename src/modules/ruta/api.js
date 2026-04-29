// ─── API Jefe de Ruta — Complemento a KoldField ─────────────────────────────
import { api } from '../../lib/api'

// ── Plan de ruta ─────────────────────────────────────────────────────────────

/** Plan de ruta del día para el chofer autenticado */
export function getMyRoutePlan(employeeId) {
  return api('GET', `/pwa-ruta/my-plan?employee_id=${employeeId}`)
}

// ── Checklist de unidad (Sebastián 2026-04-25, backend QA 32/32 PASS) ────────

/** Obtener checklist (header) de inspección de unidad para un plan.
 *
 *  Endpoint: GET /pwa-ruta/vehicle-checklist?route_plan_id=N
 *  Backend devuelve HTTP 200 SIEMPRE (incluso en errores funcionales).
 *
 *  Response existe:
 *    { ok:true, message:"OK", data:{
 *        id, route_plan_id, state ('draft'|'in_progress'|'completed'|'cancelled'),
 *        vehicle_id, vehicle_name,
 *        checks_total, checks_answered, checks_passed, checks_required_pending,
 *        created_at, initialized_at, completed_at, notes
 *    } }
 *
 *  Response no existe:
 *    { ok:true, data:null }
 *
 *  Errores: { ok:false, message:"Plan no existe." } | { ok:false, message:"No tienes acceso..." } | sesión.
 */
export function getVehicleChecklist(routePlanId) {
  return api('GET', `/pwa-ruta/vehicle-checklist?route_plan_id=${routePlanId}`)
}

/** Crear checklist (idempotente) en estado draft.
 *
 *  Endpoint: POST /pwa-ruta/vehicle-checklist-create
 *  Body: { route_plan_id }
 *
 *  Response:
 *    { ok:true, message:"Inspección creada", data:{
 *        checklist_id, state:"draft", created_at, is_new:true|false
 *    } }
 *  is_new=false cuando ya existía un checklist activo (idempotente).
 */
export function createVehicleChecklist(routePlanId) {
  return api('POST', '/pwa-ruta/vehicle-checklist-create', {
    route_plan_id: Number(routePlanId),
  })
}

/** Inicializar checklist: instancia checks desde templates. draft → in_progress.
 *
 *  Endpoint: POST /pwa-ruta/vehicle-checklist-init
 *  Body: { checklist_id }
 *
 *  Response:
 *    { ok:true, message:"Checklist inicializado", data:{
 *        checklist_id, state:"in_progress", checks_total, initialized_at
 *    } }
 *  Idempotente si ya está in_progress (no recrea checks).
 */
export function initVehicleChecklist(checklistId) {
  return api('POST', '/pwa-ruta/vehicle-checklist-init', {
    checklist_id: Number(checklistId),
  })
}

/** Lista todos los checks del checklist.
 *
 *  Endpoint: GET /pwa-ruta/vehicle-checks?checklist_id=N
 *
 *  Response:
 *    { ok:true, data:{
 *        checklist_id, state,
 *        checks: [{
 *          id, sequence, name, check_type ('yes_no'|'numeric'|'text'|'photo'),
 *          required, blocking_on_fail, passed, answered, not_passed_reason, answered_at,
 *          result_bool, result_numeric, result_text, result_photo_url,
 *          // específicos por tipo:
 *          expected_bool (yes_no), min_value/max_value (numeric)
 *        }, ...]
 *    } }
 *
 *  IMPORTANTE: el campo `answered` es la fuente de verdad para "respondido vs no",
 *  NO usar `passed` (que indica si la respuesta cumple, distinto de respondida).
 */
export function getVehicleChecks(checklistId) {
  return api('GET', `/pwa-ruta/vehicle-checks?checklist_id=${checklistId}`)
}

/** Submit individual de una respuesta. Backend computa `passed` server-side.
 *
 *  Endpoint: POST /pwa-ruta/vehicle-check
 *  Idempotente: re-submit sobreescribe.
 *
 *  Body por tipo:
 *    yes_no:  { check_id, result_bool, not_passed_reason? }
 *    numeric: { check_id, result_numeric }
 *    text:    { check_id, result_text }
 *    photo:   { check_id, result_photo (base64 sin prefijo data:image/), result_photo_filename? }
 *
 *  Response éxito:
 *    { ok:true, message:"Respuesta guardada", data:{
 *        check_id, passed, answered_at, answered_by_id,
 *        checklist_progress:{ answered, total, passed, required_pending }
 *    } }
 *
 *  Errores funcionales:
 *    code:"passed_false_requires_reason" — fail sin not_passed_reason
 *    code:"numeric_out_of_range"
 *    code:"photo_too_large"
 *    code:"invalid_photo_format"
 *    code:"check_not_found"
 *
 *  IMPORTANTE: para fotos, comprimir client-side antes de enviar (ver
 *  vehiclePhotoCompressor.compressPhotoToBase64) — JPEG q0.7 max 1920px.
 */
export function submitVehicleCheck(checkId, payload) {
  return api('POST', '/pwa-ruta/vehicle-check', {
    check_id: Number(checkId),
    ...payload,
  })
}

/** Completar checklist. Backend valida que required estén answered y ningún
 *  blocking_on_fail con passed=false.
 *
 *  Endpoint: POST /pwa-ruta/vehicle-checklist-complete
 *  Body: { checklist_id, notes? }
 *
 *  Response éxito:
 *    { ok:true, message:"Inspección completada", data:{
 *        checklist_id, state:"completed", completed_at, completed_by_id, completed_by,
 *        checks_total, checks_passed, checks_failed_non_blocking
 *    } }
 *
 *  Errores funcionales (HTTP 200):
 *    code:"checks_pending"          + data.missing_check_ids/missing_names
 *    code:"checks_failed_blocking"  + data.failed_check_ids/failed_names
 *    code:"already_completed"       — idempotente, tratar como terminal amigable
 *    code:"not_initialized"
 *
 *  La UI debe distinguir cada code para mostrar el mensaje específico.
 */
export function completeVehicleChecklist(checklistId, notes = '') {
  return api('POST', '/pwa-ruta/vehicle-checklist-complete', {
    checklist_id: Number(checklistId),
    notes: String(notes || '').trim(),
  })
}

// ── Aceptar carga ────────────────────────────────────────────────────────────

/** Ver carga asignada para mi ruta */
export function getMyLoad(routePlanId) {
  return api('GET', `/pwa-ruta/my-load?route_plan_id=${routePlanId}`)
}

/** Aceptar/confirmar la carga recibida.
 *
 *  Endpoint real (Sebastián 2026-04-25): POST /pwa-ruta/accept-load
 *  Body acepta route_plan_id o plan_id; usamos route_plan_id como canonical.
 *
 *  Respuesta éxito:
 *    { ok:true, success:true, message:'Carga sellada y picking validado',
 *      data:{ plan_id, state, load_sealed, load_sealed_at, load_sealed_by,
 *             picking_id, picking_name, picking_state } }
 *
 *  Respuesta error funcional (HTTP 200 igual):
 *    { ok:false, message:'No tienes acceso a este plan.', data:{} }
 *
 *  IMPORTANTE: el consumer DEBE validar `res.ok === true || res.success === true`
 *  antes de marcar éxito. HTTP 200 no es suficiente.
 */
export function acceptLoad(routePlanId) {
  return api('POST', '/pwa-ruta/accept-load', { route_plan_id: routePlanId })
}

// ── Incidencias ──────────────────────────────────────────────────────────────

/** Reportar incidencia */
export function createIncident(data) {
  return api('POST', '/pwa-ruta/incident-create', data)
}

/** Incidencias del día */
export function getMyIncidents(employeeId) {
  return api('GET', `/pwa-ruta/my-incidents?employee_id=${employeeId}`)
}

// ── KPIs y metas ─────────────────────────────────────────────────────────────

/** Meta mensual del vendedor */
export function getMyTarget(employeeId) {
  return api('GET', `/pwa-ruta/my-target?employee_id=${employeeId}`)
}

// ── Conciliación ─────────────────────────────────────────────────────────────

/** Conciliación del plan de ruta */
export function getReconciliation(routePlanId) {
  return api('GET', `/pwa-ruta/reconciliation?route_plan_id=${routePlanId}`)
}

// ── Detalle de carga (SKU/cantidades) ────────────────────────────────────────

/** Líneas de producto del picking de carga */
export function getLoadLines(pickingId) {
  return api('GET', `/pwa-ruta/load-lines?picking_id=${pickingId}`)
}

// ── KM persistente (gf_logistics_ops) ───────────────────────────────────────

/** Registrar KM (salida o llegada) en backend */
export function updateKm(planId, type, km) {
  return api('POST', '/pwa-ruta/km-update', { plan_id: planId, type, km })
}

// ── Validar/confirmar corte (contrato Sebastián 2026-04-25) ─────────────────

/** Pide al backend recalcular y persistir validación de corte.
 *
 *  Endpoint real: POST /pwa-ruta/validate-corte
 *  Alias backend equivalente: POST /pwa-ruta/corte-confirm (mismo handler).
 *  Decisión: usamos validate-corte como canonical (aliné nombre con el que
 *  Sebastián documentó como "preferido"). Si en el futuro cambia, el alias
 *  funciona igual sin tocar este wrapper.
 *
 *  El backend recalcula totals con _ensure_reconciliation(recompute=True);
 *  client_validation se envía como hint informativo pero NO decide.
 *
 *  Respuesta éxito:
 *    { ok:true, success:true, message:'Corte validado',
 *      data:{ plan_id, corte_validated, corte_validated_at,
 *             totals:{ loaded, delivered, returned, scrap, difference },
 *             errors:[], warnings:[] } }
 *
 *  Respuesta error funcional (HTTP 200 igual):
 *    { ok:false, success:false, code:'corte_validation_failed',
 *      message:'El corte no cuadra a cero',
 *      details:{ plan_id, totals, errors, warnings } }
 *  o:
 *    { ok:false, message:'No se encontró plan para corte.', data:{} }
 *
 *  IMPORTANTE: el consumer DEBE validar `res.ok === true && data.corte_validated === true`
 *  antes de marcar corteDone.
 *
 *  @param {number} planId
 *  @param {{valid:boolean, errors:string[], warnings:string[]}} clientValidation
 *  @param {string} [notes]
 */
export function validateCorte(planId, clientValidation, notes = '') {
  return api('POST', '/pwa-ruta/validate-corte', {
    plan_id: Number(planId),
    client_validation: clientValidation || { valid: false, errors: [], warnings: [] },
    notes: String(notes || '').trim(),
  })
}

/** Alias compatible: durante el rebase de PR #19 se identificó un commit
 *  paralelo de Sebastián (a925647) que exportó la misma función con el
 *  nombre `validateRouteCorte`. Conservamos el alias para no romper
 *  consumidores externos que ya hayan importado ese símbolo. La canonical
 *  sigue siendo `validateCorte`. */
export const validateRouteCorte = validateCorte

// ── Liquidación real (gf_logistics_ops) ─────────────────────────────────────

/** Obtener liquidacion agregada por buckets desde payments posteados */
export function getLiquidation(planId) {
  return api('POST', '/pwa-ruta/liquidation', { plan_id: planId })
}

// ── Cierre de ruta real (gf_logistics_ops) ──────────────────────────────────

/** Cerrar ruta con validacion server-side */
export function closeRoute(planId, departureKm, arrivalKm) {
  return api('POST', '/pwa-ruta/close-route', {
    plan_id: planId,
    departure_km: departureKm,
    arrival_km: arrivalKm,
  })
}

// ── Liquidación confirmar (gf_logistics_ops, endpoint real 4a/4b) ────────────

/** Confirma la liquidación del plan. Backend valida que total_collected = total_expected.
 *  Si hay diferencia y `force` != true, retorna { ok:false, code:'difference_warning',
 *  data: { total_collected, total_expected, ... } } para que la UI pida override.
 *  Llamar de nuevo con `force=true` para persistir pese a diferencia.
 *  Endpoint real: POST /gf/logistics/api/employee/liquidacion/confirm */
export function confirmLiquidacion(planId, { notes = '', force = false } = {}) {
  return api('POST', '/gf/logistics/api/employee/liquidacion/confirm', {
    plan_id: Number(planId),
    notes:   String(notes || '').trim(),
    force:   Boolean(force),
  })
}

// ── Incidencias del equipo (A2 — catálogo 7 tipos) ──────────────────────────

/** Lista de incidencias del equipo para una fecha dada.
 *  Endpoint: GET /pwa-ruta/team-incidents?date=YYYY-MM-DD
 *  Filtro opcional: ?route_ids=1,2,3 para supervisores/gerentes. */
export function getTeamIncidents({ date, routeIds } = {}) {
  const qs = new URLSearchParams()
  if (date) qs.set('date', date)
  if (Array.isArray(routeIds) && routeIds.length > 0) {
    qs.set('route_ids', routeIds.join(','))
  }
  return api('GET', `/pwa-ruta/team-incidents${qs.toString() ? `?${qs}` : ''}`)
}

// ── Tipos de incidencias (catálogo del backend) ──────────────────────────────

/**
 * @deprecated 2026-04-25 — Esta constante NO refleja el enum real del modelo
 * `gf.route.incident.incident_type`, que solo acepta:
 *   operation | customer | quality | collection | vehicle
 *
 * Los 7 IDs aquí (retraso_ruta, falta_producto, etc.) NO son aceptados por el
 * controlador y NO están consumidos por ScreenIncidencias (que ya mapea sus
 * propias 5 categorías ES → 5 valores EN del modelo).
 *
 * Conservada solo para evitar romper imports externos durante el rollout.
 * Eliminar cuando se confirme que ningún consumidor lo referencia. */
export const INCIDENT_TYPE_CATALOG = [
  { id: 'retraso_ruta',         label: 'Retraso en ruta' },
  { id: 'falta_producto',       label: 'Falta de producto' },
  { id: 'sobrante_producto',    label: 'Sobrante de producto' },
  { id: 'devolucion_fuera',     label: 'Devolución fuera de rango' },
  { id: 'falla_mecanica',       label: 'Falla mecánica' },
  { id: 'cliente_no_atendido',  label: 'Cliente no atendido' },
  { id: 'cobro_no_realizado',   label: 'Cobro no realizado' },
]
