import { TOKENS } from '../../tokens.js'

const VISITED_STATES = new Set(['visited', 'done', 'completed'])
const UNVISITED_STATES = new Set(['not_visited', 'not visited', 'skipped'])

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeSalesCount(value) {
  return Number(value || 0)
}

export function deriveStopVisitState(stop = {}) {
  const status = normalizeStatus(stop.result_status)
  const salesCount = normalizeSalesCount(stop.sales_count)
  const hasCheckin = stop.has_checkin === true

  if (salesCount > 0) {
    return { key: 'sale', label: 'Con venta', color: TOKENS.colors.blue3, badgeStatus: 'done' }
  }
  if (hasCheckin || VISITED_STATES.has(status)) {
    return { key: 'visited', label: 'Visitado', color: TOKENS.colors.success, badgeStatus: 'done' }
  }
  if (UNVISITED_STATES.has(status) || !status || status === 'pending') {
    return { key: 'unvisited', label: 'No visitado', color: TOKENS.colors.error, badgeStatus: 'error' }
  }
  if (status.includes('progress')) {
    return { key: 'in_progress', label: 'En progreso', color: TOKENS.colors.blue2, badgeStatus: 'in_progress' }
  }

  return { key: 'unvisited', label: 'No visitado', color: TOKENS.colors.error, badgeStatus: 'error' }
}

export function isStopVisited(stop = {}) {
  const key = deriveStopVisitState(stop).key
  return key === 'visited' || key === 'sale'
}

export function isStopUnvisited(stop = {}) {
  return deriveStopVisitState(stop).key === 'unvisited'
}

export function isStopWithSale(stop = {}) {
  return deriveStopVisitState(stop).key === 'sale'
}
