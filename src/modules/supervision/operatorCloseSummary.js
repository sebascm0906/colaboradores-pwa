import {
  getOperatorCloseSummary,
  shouldAutoCloseOperatorTurn,
} from '../shared/operatorTurnCloseStore.js'

function getBackendSummaryKeys(role) {
  if (role === 'operador_barra') {
    return {
      closed: 'operator_barra_closed',
      closedAt: 'operator_barra_closed_at',
    }
  }
  if (role === 'operador_rolito') {
    return {
      closed: 'operator_rolito_closed',
      closedAt: 'operator_rolito_closed_at',
    }
  }
  return { closed: '', closedAt: '' }
}

export function buildSupervisorOperatorSummary(shiftLike, backendSummary = null) {
  const summary = backendSummary && typeof backendSummary === 'object' ? backendSummary : {}
  const localOperatorSummary = getOperatorCloseSummary(shiftLike)

  return localOperatorSummary.map((item) => {
    const keys = getBackendSummaryKeys(item.role)
    if (!keys.closed || summary[keys.closed] == null) return item

    const backendClosed = Boolean(summary[keys.closed])
    const preserveLocalAutoClose =
      item.closed
      && shouldAutoCloseOperatorTurn(shiftLike, item.role)
      && !backendClosed

    if (preserveLocalAutoClose) return item

    return {
      ...item,
      closed: backendClosed,
      closed_at: summary[keys.closedAt] || item.closed_at || null,
    }
  })
}

export function buildTurnControlInitialOperatorSummary(shiftLike) {
  return buildSupervisorOperatorSummary(shiftLike, null)
}
