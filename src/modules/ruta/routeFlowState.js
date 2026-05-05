/**
 * Determine current step and status of each step in the guided route flow.
 * Returns { currentStep, steps: [{id, label, status, route}] }
 *
 * status: 'done' | 'active' | 'pending' | 'blocked'
 */
export function calculateFlowState(plan, bridgeData = {}) {
  const state = plan?.state || 'draft'
  const loadAccepted = plan?.load_sealed || false
  const kmSalida = bridgeData.kmSalida || null
  const stopsTotal = plan?.stops_total || 0
  const stopsDone = plan?.stops_done || 0
  const corteDone = bridgeData.corteDone || false
  const liquidacionDone = bridgeData.liquidacionDone || false
  const cierreDone = state === 'closed' || state === 'reconciled'

  const inicioDone = state === 'in_progress' && loadAccepted
  const allStopsDone = stopsDone >= stopsTotal && stopsTotal > 0
  const postRouteOpsAvailable = inicioDone && !cierreDone

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
      status: inicioDone ? (allStopsDone ? 'done' : 'active') : 'pending',
      route: '/ruta/control',
      detail: inicioDone ? `${stopsDone}/${stopsTotal} paradas` : 'Completa inicio',
    },
    {
      id: 'inventario',
      label: 'Inventario',
      status: postRouteOpsAvailable ? 'active' : 'pending',
      route: '/ruta/inventario',
      detail: 'Carga vs ventas vs devoluciones',
    },
    {
      id: 'corte',
      label: 'Corte',
      status: corteDone ? 'done' : (postRouteOpsAvailable ? 'active' : 'pending'),
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

  const currentStep = steps.find(s => s.status === 'active')?.id || steps[0].id

  return { currentStep, steps }
}
