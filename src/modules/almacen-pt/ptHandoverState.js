export function normalizePendingPtHandover(raw = {}) {
  return {
    ...raw,
    id: Number(raw?.id || 0),
    source_shift_id: Number(raw?.source_shift_id || 0) || null,
    required_after_supervisor_close: Boolean(raw?.required_after_supervisor_close),
    warehouse_blocked: Boolean(raw?.warehouse_blocked),
    count_submitted: Boolean(raw?.count_submitted),
  }
}

export function derivePtBlockState({ summary = {}, handover = null } = {}) {
  const blocked = Boolean(summary?.pt_blocked_by_handover || handover?.warehouse_blocked)
  const explicitReason = String(summary?.pt_block_reason || '').trim()
  return {
    blocked,
    reason: blocked ? (explicitReason || 'handover_pending') : 'none',
  }
}

export function translatePtBlockedError(codeOrMessage = '') {
  const value = String(codeOrMessage || '')
  if (value.includes('PT_BLOCKED_BY_HANDOVER')) {
    return 'PT cerrado por relevo pendiente. Acepta el turno para continuar.'
  }
  return value || 'Error operando Almacén PT'
}
