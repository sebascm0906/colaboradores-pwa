export const KOLDCUP_STEP_STATUS = {
  LOCKED: 'locked',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ALERT: 'alert',
}

function arr(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : []
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function normalizeKoldcupSummary(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      date: '',
      warehouseId: 0,
      cashLocation: null,
      purchase: { count: 0, totalAmount: 0, hasUnlinkedCashOut: false },
      production: { inputQty: 0, outputQty: 0, scrapQty: 0 },
      inventory: { inputAvailableQty: 0, finishedAvailableQty: 0 },
      close: { state: 'unavailable', canClose: false, blockers: ['Resumen KOLDCUP no disponible'], warnings: [] },
      transfer: { state: 'pending', pickingId: null, pickingName: '', originName: '', destinationName: '', productId: 0 },
    }
  }

  const data = raw.data && typeof raw.data === 'object' ? raw.data : raw
  return {
    date: String(data.date || ''),
    warehouseId: num(data.warehouse_id ?? data.warehouseId),
    cashLocation: data.cash_location || data.cashLocation || null,
    purchase: {
      count: num(data.purchase?.count),
      totalAmount: num(data.purchase?.total_amount ?? data.purchase?.totalAmount),
      hasUnlinkedCashOut: Boolean(data.purchase?.has_unlinked_cash_out ?? data.purchase?.hasUnlinkedCashOut),
    },
    production: {
      inputQty: num(data.production?.input_qty ?? data.production?.inputQty),
      outputQty: num(data.production?.output_qty ?? data.production?.outputQty),
      scrapQty: num(data.production?.scrap_qty ?? data.production?.scrapQty),
    },
    inventory: {
      inputAvailableQty: num(data.inventory?.input_available_qty ?? data.inventory?.inputAvailableQty),
      finishedAvailableQty: num(data.inventory?.finished_available_qty ?? data.inventory?.finishedAvailableQty),
    },
    close: {
      state: String(data.close?.state || 'open'),
      canClose: Boolean(data.close?.can_close ?? data.close?.canClose),
      blockers: arr(data.close?.blockers),
      warnings: arr(data.close?.warnings),
    },
    transfer: {
      state: String(data.transfer?.state || 'pending'),
      pickingId: data.transfer?.picking_id ?? data.transfer?.pickingId ?? null,
      pickingName: String(data.transfer?.picking_name ?? data.transfer?.pickingName ?? ''),
      originName: String(data.transfer?.origin_name ?? data.transfer?.originName ?? data.transfer?.origin ?? ''),
      destinationName: String(data.transfer?.destination_name ?? data.transfer?.destinationName ?? data.transfer?.destination ?? ''),
      productId: num(data.transfer?.product_id ?? data.transfer?.productId),
    },
  }
}

export function computeKoldcupSteps(summaryInput) {
  const summary = normalizeKoldcupSummary(summaryInput)
  const purchaseDone = summary.purchase.count > 0 && !summary.purchase.hasUnlinkedCashOut
  const productionDone = summary.production.outputQty > 0
  const closeDone = summary.close.state === 'closed'
  const transferDone = ['done', 'completed', 'validated'].includes(summary.transfer.state)
  const closeBlocked = summary.close.blockers.length > 0

  return [
    {
      id: 'compra',
      label: 'Compra',
      route: '/koldcup/compra',
      status: purchaseDone ? KOLDCUP_STEP_STATUS.COMPLETED : KOLDCUP_STEP_STATUS.IN_PROGRESS,
      badge: purchaseDone ? `$${summary.purchase.totalAmount.toFixed(2)}` : 'Pendiente',
    },
    {
      id: 'produccion',
      label: 'Produccion',
      route: '/koldcup/produccion',
      status: !purchaseDone
        ? KOLDCUP_STEP_STATUS.LOCKED
        : productionDone ? KOLDCUP_STEP_STATUS.COMPLETED : KOLDCUP_STEP_STATUS.IN_PROGRESS,
      badge: productionDone ? `${summary.production.outputQty} vasos` : '',
    },
    {
      id: 'corte',
      label: 'Corte',
      route: '/koldcup/corte',
      status: closeDone
        ? KOLDCUP_STEP_STATUS.COMPLETED
        : closeBlocked ? KOLDCUP_STEP_STATUS.ALERT
          : productionDone ? KOLDCUP_STEP_STATUS.IN_PROGRESS : KOLDCUP_STEP_STATUS.LOCKED,
      badge: closeDone ? 'Cerrado' : closeBlocked ? 'Bloqueado' : '',
    },
    {
      id: 'traspaso',
      label: 'Traspaso',
      route: '/koldcup/traspaso',
      status: transferDone
        ? KOLDCUP_STEP_STATUS.COMPLETED
        : closeDone || summary.close.canClose ? KOLDCUP_STEP_STATUS.PENDING : KOLDCUP_STEP_STATUS.LOCKED,
      badge: summary.transfer.pickingName || '',
    },
  ]
}

export function validateKoldcupPurchaseDraft(draft = {}) {
  const errors = {}
  if (!Number(draft.product_id || 0)) errors.product_id = 'Selecciona un insumo'
  if (Number(draft.qty || 0) <= 0) errors.qty = 'Captura cantidad mayor a cero'
  if (Number(draft.unit_price || 0) <= 0) errors.unit_price = 'Captura precio mayor a cero'
  return errors
}

export function validateKoldcupCloseDraft(draft = {}) {
  const errors = {}
  if (Number(draft.final_input_count || 0) < 0) errors.final_input_count = 'No puede ser negativo'
  if (Number(draft.final_finished_count || 0) < 0) errors.final_finished_count = 'No puede ser negativo'

  const inputDiff = Number(draft.final_input_count || 0) !== Number(draft.expected_input_count || 0)
  const finishedDiff = Number(draft.final_finished_count || 0) !== Number(draft.expected_finished_count || 0)
  if ((inputDiff || finishedDiff) && !String(draft.difference_reason || '').trim()) {
    errors.difference_reason = 'Explica la diferencia antes de cerrar'
  }
  return errors
}
