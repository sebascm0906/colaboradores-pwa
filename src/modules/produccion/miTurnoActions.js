import { TOKENS } from '../../tokens.js'

export function getMiTurnoActions({ isBarras = false, readySlotsCount = 0 } = {}) {
  return [
    ...(isBarras ? [{
      id: 'tanque',
      label: 'Extraer del tanque',
      desc: `${readySlotsCount || 0} canastillas listas`,
      route: '/produccion/tanque',
      color: (readySlotsCount || 0) > 0 ? TOKENS.colors.success : '#38bdf8',
      iconKey: 'tanque',
    }] : []),
    ...(!isBarras ? [{
      id: 'empaque',
      label: 'Empaque',
      desc: 'Registrar bolsas',
      route: '/produccion/empaque',
      color: TOKENS.colors.success,
      iconKey: 'empaque',
    }] : []),
    ...(!isBarras ? [{
      id: 'ciclo',
      label: 'Nuevo Ciclo',
      desc: 'Congelación + deshielo',
      route: '/produccion/ciclo',
      color: TOKENS.colors.blue2,
      iconKey: 'ciclo',
    }] : []),
    {
      id: 'incidencia',
      label: 'Reportar problema',
      desc: 'Paro, merma o incidencia',
      route: '/produccion/incidencia',
      color: TOKENS.colors.warning,
      iconKey: 'incidencia',
    },
    {
      id: 'checklist',
      label: 'Inspección',
      desc: 'Checklist HACCP',
      route: '/produccion/checklist',
      color: TOKENS.colors.textMuted,
      iconKey: 'checklist',
    },
    {
      id: 'corte',
      label: 'Resumen del turno',
      desc: 'Resumen de producción',
      route: '/produccion/corte',
      color: TOKENS.colors.blue3,
      iconKey: 'corte',
    },
    {
      id: 'cierre',
      label: 'Cerrar turno',
      desc: 'Finalizar y cerrar',
      route: '/produccion/cierre',
      color: TOKENS.colors.error,
      iconKey: 'cierre',
    },
  ]
}
