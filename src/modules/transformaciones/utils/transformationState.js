const PRIMARY_STATE_MAP = {
  cancelled: { key: 'cancelled', label: 'Cancelada', tone: 'error' },
  canceled: { key: 'cancelled', label: 'Cancelada', tone: 'error' },
  done: { key: 'confirmed', label: 'Confirmada', tone: 'success' },
  confirmed: { key: 'confirmed', label: 'Confirmada', tone: 'success' },
  posted: { key: 'confirmed', label: 'Confirmada', tone: 'success' },
  completed: { key: 'confirmed', label: 'Confirmada', tone: 'success' },
  draft: { key: 'pending', label: 'Pendiente', tone: 'warning' },
  pending: { key: 'pending', label: 'Pendiente', tone: 'warning' },
  in_progress: { key: 'pending', label: 'Pendiente', tone: 'warning' },
}

const FALLBACK_PRIMARY = { key: 'pending', label: 'Pendiente', tone: 'warning' }
const VARIANCE_BADGE = { key: 'variance', label: 'Con variacion', tone: 'warning' }

function normalizeRawState(value) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeTransformationUiState(item = {}) {
  const cancelledByReason = Boolean(String(item?.cancel_reason || '').trim())
  const rawState = normalizeRawState(item?.state)
  const primary = cancelledByReason
    ? PRIMARY_STATE_MAP.cancelled
    : (PRIMARY_STATE_MAP[rawState] || FALLBACK_PRIMARY)

  return {
    primary,
    secondary: item?.irregularity_flag ? VARIANCE_BADGE : null,
  }
}
