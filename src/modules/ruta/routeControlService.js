// routeControlService.js — V2 Jefe de Ruta Service Layer
// ═══════════════════════════════════════════════════════════════════════════════
// Backend: gf_logistics_ops (Sebastián) — KM, liquidación, cierre, conciliación
// Todos los endpoints conectados a producción.
// localStorage se mantiene SOLO como cache/fallback offline.
// Concepto clave: App de DISCIPLINA OPERATIVA, no de ventas.
// Kold Field ejecuta; la PWA controla.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  getMyRoutePlan,
  getMyTarget,
  getMyIncidents,
  getMyLoad,
  getLoadLines,
  getReconciliation,
  getVehicleChecklist,
  updateKm,
  getLiquidation,
  closeRoute,
} from './api'

// ═══════════════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Route plan states */
export const PLAN_STATES = {
  draft: { label: 'Borrador', color: '#94a3b8' },
  published: { label: 'Publicada', color: '#f59e0b' },
  in_progress: { label: 'En progreso', color: '#2B8FE0' },
  closed: { label: 'Cerrada', color: '#22c55e' },
  reconciled: { label: 'Conciliada', color: '#22c55e' },
}

/** Stop result statuses */
export const STOP_RESULTS = {
  delivered_full: { label: 'Entrega completa', color: '#22c55e', icon: 'check' },
  delivered_partial: { label: 'Entrega parcial', color: '#f59e0b', icon: 'partial' },
  not_visited: { label: 'No visitado', color: '#ef4444', icon: 'x' },
  closed: { label: 'Cerrado', color: '#94a3b8', icon: 'lock' },
  no_stock: { label: 'Sin stock', color: '#ef4444', icon: 'empty' },
  rejected: { label: 'Rechazado', color: '#ef4444', icon: 'reject' },
}

/** Guided flow steps — the 6 stations */
export const FLOW_STEPS = [
  { id: 'inicio', label: 'Inicio', icon: 'play' },
  { id: 'control', label: 'Control', icon: 'monitor' },
  { id: 'inventario', label: 'Inventario', icon: 'box' },
  { id: 'corte', label: 'Corte', icon: 'clipboard' },
  { id: 'liquidacion', label: 'Liquidación', icon: 'dollar' },
  { id: 'cierre', label: 'Cierre', icon: 'flag' },
]

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Route Day Summary
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build composite day summary for the hub.
 * Uses existing LIVE endpoints.
 */
export async function getRouteDaySummary(employeeId) {
  const [planResult, targetResult, incidentsResult] = await Promise.allSettled([
    getMyRoutePlan(employeeId),
    getMyTarget(employeeId),
    getMyIncidents(employeeId),
  ])

  const plan = planResult.status === 'fulfilled' ? planResult.value : null
  const target = targetResult.status === 'fulfilled' ? targetResult.value : null
  const incidents = incidentsResult.status === 'fulfilled' ? incidentsResult.value : []

  // Load checklist status, reconciliation, and load lines in parallel
  let reconciliation = null
  let loadLines = []
  let checklistDone = false

  if (plan?.id) {
    const tasks = []

    // Checklist status
    tasks.push(
      getVehicleChecklist(plan.id)
        .then(cl => { checklistDone = cl?.state === 'completed' })
        .catch(() => { /* empty */ })
    )

    // Reconciliation
    if (plan.reconciliation_id) {
      tasks.push(
        getReconciliation(plan.id)
          .then(r => { reconciliation = r })
          .catch(() => { /* empty */ })
      )
    }

    // Load lines
    if (plan.load_picking_id) {
      const pickingId = Array.isArray(plan.load_picking_id)
        ? plan.load_picking_id[0]
        : plan.load_picking_id
      tasks.push(
        getLoadLines(pickingId)
          .then(ll => { loadLines = Array.isArray(ll) ? ll : [] })
          .catch(() => { /* empty */ })
      )
    }

    await Promise.all(tasks)
  }

  return {
    plan,
    target,
    incidents: Array.isArray(incidents) ? incidents : [],
    reconciliation,
    loadLines,
    checklistDone,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Flow Step Calculator
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine current step and status of each step in the guided flow.
 * Returns { currentStep, steps: [{id, label, status, route}] }
 *
 * status: 'done' | 'active' | 'pending' | 'blocked'
 */
export function calculateFlowState(plan, bridgeData = {}) {
  const state = plan?.state || 'draft'
  const checklistDone = bridgeData.checklistDone || false
  const loadAccepted = plan?.load_sealed || false
  const kmSalida = bridgeData.kmSalida || null
  const stopsTotal = plan?.stops_total || 0
  const stopsDone = plan?.stops_done || 0
  const hasReconciliation = !!plan?.reconciliation_id
  const corteDone = bridgeData.corteDone || false
  const liquidacionDone = bridgeData.liquidacionDone || false
  const cierreDone = state === 'closed' || state === 'reconciled'

  // Determine if inicio phase is complete
  const inicioDone = state === 'in_progress' && loadAccepted

  // Build step statuses
  const steps = [
    {
      id: 'inicio',
      label: 'Inicio del Día',
      status: inicioDone ? 'done' : 'active',
      route: '/ruta',
      detail: !loadAccepted ? 'Acepta tu carga' : !kmSalida ? 'Registra KM salida' : 'Completado',
    },
    {
      id: 'control',
      label: 'Control de Ruta',
      status: inicioDone ? (stopsDone >= stopsTotal && stopsTotal > 0 ? 'done' : 'active') : 'pending',
      route: '/ruta/control',
      detail: inicioDone ? `${stopsDone}/${stopsTotal} paradas` : 'Completa inicio',
    },
    {
      id: 'inventario',
      label: 'Inventario',
      status: stopsDone >= stopsTotal && stopsTotal > 0 ? 'active' : 'pending',
      route: '/ruta/inventario',
      detail: 'Carga vs ventas vs devoluciones',
    },
    {
      id: 'corte',
      label: 'Corte',
      status: corteDone ? 'done' : (stopsDone >= stopsTotal && stopsTotal > 0 ? 'active' : 'pending'),
      route: '/ruta/corte',
      detail: corteDone ? 'Cuadre OK' : 'Cuadre de unidades',
    },
    {
      id: 'liquidacion',
      label: 'Liquidación',
      status: liquidacionDone ? 'done' : (corteDone ? 'active' : 'pending'),
      route: '/ruta/liquidacion',
      detail: liquidacionDone ? 'Cuadre dinero OK' : 'Cuadre de dinero',
    },
    {
      id: 'cierre',
      label: 'Cierre de Ruta',
      status: cierreDone ? 'done' : (liquidacionDone ? 'active' : 'pending'),
      route: '/ruta/cierre',
      detail: cierreDone ? 'Ruta cerrada' : 'KM final + resumen',
    },
  ]

  // Find current step (first non-done)
  const currentStep = steps.find(s => s.status === 'active')?.id || steps[0].id

  return { currentStep, steps }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Progress Calculations
// ═══════════════════════════════════════════════════════════════════════════════

/** Calculate progress percentage */
export function getProgressPct(plan) {
  const total = plan?.stops_total || 0
  const done = plan?.stops_done || 0
  if (total === 0) return 0
  return Math.round((done / total) * 100)
}

/** Calculate target progress (sales vs target) */
export function getTargetProgress(target) {
  if (!target) return { salesPct: 0, collectionPct: 0 }
  const salesTarget = target.sales_target || 0
  const salesActual = target.sales_actual || 0
  const collTarget = target.collection_target || 0
  const collActual = target.collection_actual || 0
  return {
    salesPct: salesTarget > 0 ? Math.round((salesActual / salesTarget) * 100) : 0,
    collectionPct: collTarget > 0 ? Math.round((collActual / collTarget) * 100) : 0,
    salesActual,
    salesTarget,
    collectionActual: collActual,
    collectionTarget: collTarget,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Inventory Calculations (from reconciliation + load lines)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build inventory view: what was loaded vs delivered vs returned vs remaining.
 * Uses reconciliation data (LIVE) when available.
 */
export function buildInventoryView(reconciliation, loadLines) {
  if (reconciliation?.line_ids && reconciliation.line_ids.length > 0) {
    // Use reconciliation lines (more accurate)
    return {
      source: 'reconciliation',
      totals: {
        loaded: reconciliation.qty_loaded || 0,
        delivered: reconciliation.qty_delivered || 0,
        returned: reconciliation.qty_returned || 0,
        scrap: reconciliation.qty_scrap || 0,
        difference: reconciliation.qty_difference || 0,
      },
      lines: (reconciliation.line_ids || []).map(line => ({
        product: line.product_id?.[1] || line.product_name || 'Producto',
        product_id: line.product_id?.[0] || line.product_id,
        loaded: line.qty_loaded || 0,
        delivered: line.qty_delivered || 0,
        returned: line.qty_returned || 0,
        scrap: line.qty_scrap || 0,
        difference: line.qty_difference || 0,
        remaining: (line.qty_loaded || 0) - (line.qty_delivered || 0) - (line.qty_returned || 0) - (line.qty_scrap || 0),
      })),
    }
  }

  // Fallback: use load lines only (no delivery info yet)
  if (loadLines && loadLines.length > 0) {
    const totalLoaded = loadLines.reduce((s, l) => s + (l.product_uom_qty || l.quantity || 0), 0)
    return {
      source: 'load_lines',
      totals: {
        loaded: totalLoaded,
        delivered: 0,
        returned: 0,
        scrap: 0,
        difference: 0,
      },
      lines: loadLines.map(line => ({
        product: line.product_id?.[1] || line.product_name || 'Producto',
        product_id: line.product_id?.[0] || line.product_id,
        loaded: line.product_uom_qty || line.quantity || 0,
        delivered: 0,
        returned: 0,
        scrap: 0,
        difference: 0,
        remaining: line.product_uom_qty || line.quantity || 0,
      })),
    }
  }

  return { source: 'empty', totals: { loaded: 0, delivered: 0, returned: 0, scrap: 0, difference: 0 }, lines: [] }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE — Corte Validation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate reconciliation for corte: inventory must be = 0.
 * Returns { valid, errors[], warnings[] }
 */
export function validateCorte(inventoryView) {
  const errors = []
  const warnings = []

  if (inventoryView.source === 'empty') {
    errors.push('No hay datos de carga para conciliar')
    return { valid: false, errors, warnings }
  }

  // Check each line — remaining (loaded - delivered - returned - scrap) should be 0
  for (const line of inventoryView.lines) {
    const remaining = line.remaining
    if (remaining > 0) {
      errors.push(`${line.product}: ${remaining} unidades sin justificar`)
    } else if (remaining < 0) {
      warnings.push(`${line.product}: ${Math.abs(remaining)} unidades de mas (revisa datos)`)
    }
  }

  // Total difference
  const totalDiff = inventoryView.totals.difference
  if (totalDiff !== 0) {
    warnings.push(`Diferencia total: ${totalDiff > 0 ? '+' : ''}${totalDiff} unidades`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  KM Tracking — Backend-first via POST /pwa-ruta/km-update
//  localStorage como cache para lectura inmediata
// ═══════════════════════════════════════════════════════════════════════════════

const KM_STORAGE_KEY = 'gf_ruta_km'

/**
 * Save KM salida — persists to backend + localStorage cache.
 */
export async function saveKmSalida(planId, km) {
  // Cache locally for immediate read
  const data = _getKmData()
  data[planId] = { ...data[planId], kmSalida: km, kmSalidaAt: new Date().toISOString() }
  localStorage.setItem(KM_STORAGE_KEY, JSON.stringify(data))
  // Persist to backend (fire-and-forget, don't block UI)
  try { await updateKm(planId, 'departure', km) } catch (e) { console.warn('[GFSC][routeControlService] updateKm(departure) failed:', e?.message || e) }
  return data[planId]
}

/**
 * Save KM llegada — persists to backend + localStorage cache.
 */
export async function saveKmLlegada(planId, km) {
  const data = _getKmData()
  data[planId] = { ...data[planId], kmLlegada: km, kmLlegadaAt: new Date().toISOString() }
  localStorage.setItem(KM_STORAGE_KEY, JSON.stringify(data))
  try { await updateKm(planId, 'arrival', km) } catch (e) { console.warn('[GFSC][routeControlService] updateKm(arrival) failed:', e?.message || e) }
  return data[planId]
}

/**
 * Get KM data for a plan.
 * Reads from plan object (backend) first, falls back to localStorage cache.
 */
export function getKmData(planId, plan) {
  const local = _getKmData()[planId] || {}
  // If plan has backend KM, use those as source of truth
  if (plan) {
    const backendKm = {}
    if (plan.departure_km > 0) backendKm.kmSalida = plan.departure_km
    if (plan.arrival_km > 0) backendKm.kmLlegada = plan.arrival_km
    // Backend wins, local fills gaps
    return { ...local, ...backendKm }
  }
  return local
}

function _getKmData() {
  try { return JSON.parse(localStorage.getItem(KM_STORAGE_KEY) || '{}') } catch { return {} }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Corte/Liquidacion/Cierre state — localStorage cache + backend fields
// ═══════════════════════════════════════════════════════════════════════════════

const CIERRE_STORAGE_KEY = 'gf_ruta_cierre'

export function saveCierreState(planId, state) {
  const data = _getCierreData()
  data[planId] = { ...data[planId], ...state, updatedAt: new Date().toISOString() }
  localStorage.setItem(CIERRE_STORAGE_KEY, JSON.stringify(data))
  return data[planId]
}

/**
 * Get cierre state — merges backend plan fields with localStorage cache.
 */
export function getCierreState(planId, plan) {
  const local = _getCierreData()[planId] || {}
  if (plan) {
    // Backend fields override local cache when available
    if (plan.corte_validated) local.corteDone = true
    if (plan.state === 'closed' || plan.state === 'reconciled') {
      local.closed = true
      local.liquidacionDone = true
      local.corteDone = true
    }
  }
  return local
}

function _getCierreData() {
  try { return JSON.parse(localStorage.getItem(CIERRE_STORAGE_KEY) || '{}') } catch { return {} }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Liquidacion — Backend-first via GET /pwa-ruta/liquidation
//  localStorage como fallback si backend no disponible
// ═══════════════════════════════════════════════════════════════════════════════

const LIQ_STORAGE_KEY = 'gf_ruta_liquidacion'

/**
 * Fetch liquidation data from backend.
 * Backend format: { ok: true, message, data: { payments: { cash, credit, transfer }, total_collected, total_expected } }
 * Falls back to localStorage if endpoint not ready.
 */
export async function fetchLiquidacion(planId) {
  try {
    const result = await getLiquidation(planId)
    // Unwrap {ok, data} envelope from gf_logistics_ops
    const payload = result?.data || result
    if (payload && (payload.total_collected !== undefined || payload.payments)) {
      return { source: 'backend', data: payload }
    }
  } catch (e) { console.warn('[GFSC][routeControlService] getLiquidation failed, falling back to local:', e?.message || e) }
  // Fallback to localStorage
  const local = getLiquidacionLocal(planId)
  return { source: 'local', data: local }
}

/** Save liquidacion data to localStorage cache. */
export function saveLiquidacionLocal(planId, data) {
  const all = _getLiqData()
  all[planId] = { ...data, savedAt: new Date().toISOString() }
  localStorage.setItem(LIQ_STORAGE_KEY, JSON.stringify(all))
  return all[planId]
}

export function getLiquidacionLocal(planId) {
  return _getLiqData()[planId] || null
}

function _getLiqData() {
  try { return JSON.parse(localStorage.getItem(LIQ_STORAGE_KEY) || '{}') } catch { return {} }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Close Route — Backend-first via POST /pwa-ruta/close-route
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Close route via backend with server-side validation.
 * Backend format: { ok: true, message, data: { plan_id, state, closure_time, departure_km, arrival_km, km_traveled, return_picking_id, warnings } }
 * Errors come as JSON-RPC exceptions (thrown by odooJson).
 * Falls back to local save if backend not available.
 */
export async function closeRouteWithValidation(planId, departureKm, arrivalKm) {
  try {
    const result = await closeRoute(planId, departureKm, arrivalKm)
    // Unwrap {ok, data} envelope from gf_logistics_ops
    const payload = result?.data || result
    const ok = result?.ok !== undefined ? result.ok : (payload?.state === 'closed')

    if (!ok) {
      // Unexpected non-ok response (unlikely since errors throw)
      return { success: false, errors: [result?.message || 'Error del servidor'], warnings: payload?.warnings || [], source: 'backend' }
    }

    // Success — also update local cache
    saveCierreState(planId, {
      closed: true,
      closedAt: payload.closure_time || new Date().toISOString(),
      kmSalida: departureKm,
      kmLlegada: arrivalKm,
      kmRecorridos: payload.km_traveled || (arrivalKm - departureKm),
    })
    return {
      success: true,
      source: 'backend',
      state: payload.state,
      closure_time: payload.closure_time,
      km_traveled: payload.km_traveled,
      warnings: payload.warnings || [],
    }
  } catch (e) {
    // JSON-RPC exceptions from backend come here (validation errors, business logic errors)
    const msg = e.message || 'Error al conectar con servidor'
    // Differentiate: network error vs business logic error from Odoo
    const isBusinessError = msg && !msg.includes('fetch') && !msg.includes('network') && !msg.includes('Failed to')
    console.warn('[closeRoute] Error:', msg)
    return {
      success: false,
      errors: [msg],
      warnings: [],
      source: isBusinessError ? 'backend' : 'error',
    }
  }
}

/**
 * Client-side pre-validation before attempting close.
 * Catches obvious errors before hitting the server.
 */
export function validateCierre(plan, kmData, cierreState, inventoryView) {
  const errors = []
  const warnings = []

  if (!kmData.kmSalida) errors.push('Falta KM de salida')
  if (!kmData.kmLlegada) errors.push('Falta KM de llegada')
  if (kmData.kmSalida && kmData.kmLlegada && kmData.kmLlegada < kmData.kmSalida) {
    errors.push('KM llegada debe ser mayor que KM salida')
  }

  if (!cierreState.corteDone) errors.push('Corte de unidades no completado')
  if (!cierreState.liquidacionDone) errors.push('Liquidacion no completada')

  // Check inventory = 0
  const corteValidation = validateCorte(inventoryView)
  if (!corteValidation.valid) {
    errors.push('Inventario final no cuadra a 0')
  }

  const kmRecorridos = (kmData.kmLlegada && kmData.kmSalida)
    ? kmData.kmLlegada - kmData.kmSalida
    : 0

  return { valid: errors.length === 0, errors, warnings, kmRecorridos }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Format number with comma thousands */
export function fmtNum(n) {
  if (n == null || isNaN(n)) return '0'
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })
}

/** Format currency */
export function fmtMoney(n) {
  if (n == null || isNaN(n)) return '$0'
  return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Format percentage */
export function fmtPct(n) {
  if (n == null || isNaN(n)) return '0%'
  return Math.round(n) + '%'
}

/** Get today's date as YYYY-MM-DD */
export function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
