export function validateCierre(plan, kmData, cierreState, inventoryView, validateCorteFn) {
  const errors = []
  const warnings = []

  if (kmData.kmSalida && kmData.kmLlegada && kmData.kmLlegada <= kmData.kmSalida) {
    errors.push('KM llegada debe ser mayor que KM salida')
  }

  if (!cierreState.corteDone) errors.push('Corte de unidades no completado')
  if (!cierreState.liquidacionDone) errors.push('Liquidacion no completada')

  const corteValidation = validateCorteFn(inventoryView)
  if (!corteValidation.valid) {
    errors.push('Inventario final no cuadra a 0')
  }

  const kmRecorridos = (kmData.kmLlegada && kmData.kmSalida)
    ? kmData.kmLlegada - kmData.kmSalida
    : 0

  return { valid: errors.length === 0, errors, warnings, kmRecorridos }
}
