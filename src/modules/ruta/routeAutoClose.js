const CLOSED_ROUTE_STATES = new Set(['closed', 'reconciled'])

function numberOrZero(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function getCloseKilometers(km) {
  const departureKm = numberOrZero(km?.kmSalida)
  const arrivalKm = numberOrZero(km?.kmLlegada)
  if (departureKm > 0 && arrivalKm > departureKm) {
    return { departureKm, arrivalKm }
  }
  return { departureKm: 0, arrivalKm: 0 }
}

export async function autoCloseRouteAfterLiquidacion({
  plan,
  now = () => new Date().toISOString(),
  getKmData,
  saveCierreState,
  closeRouteWithValidation,
}) {
  if (!plan?.id) {
    return {
      liquidacionSaved: false,
      closeAttempted: false,
      closeResult: null,
    }
  }

  const liquidacionAt = now()
  saveCierreState(plan.id, { liquidacionDone: true, liquidacionAt })

  const planState = String(plan.state || '').toLowerCase()
  if (CLOSED_ROUTE_STATES.has(planState)) {
    return {
      liquidacionSaved: true,
      closeAttempted: false,
      closeResult: { success: true, state: planState, alreadyClosed: true },
    }
  }

  const km = getKmData(plan.id, plan) || {}
  const { departureKm, arrivalKm } = getCloseKilometers(km)
  const closeResult = await closeRouteWithValidation(plan.id, departureKm, arrivalKm)

  if (closeResult?.success) {
    saveCierreState(plan.id, {
      closed: true,
      closedAt: closeResult.closure_time || now(),
      autoClosedAfterLiquidacion: true,
    })
  }

  return {
    liquidacionSaved: true,
    closeAttempted: true,
    closeResult,
  }
}
