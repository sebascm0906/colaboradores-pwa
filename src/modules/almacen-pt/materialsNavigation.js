function isSafeAppPath(value) {
  return typeof value === 'string' && value.startsWith('/')
}

export function defaultMaterialesBackToForRole(role, fallback = '/almacen-pt') {
  const normalized = String(role || '').trim()
  if (['operador_barra', 'operador_rolito', 'auxiliar_produccion'].includes(normalized)) {
    return '/produccion'
  }
  if (normalized === 'supervisor_produccion') {
    return '/supervision'
  }
  if (normalized === 'almacenista_pt') {
    return '/almacen-pt'
  }
  if (normalized === 'gerente_sucursal') {
    return '/admin'
  }
  return fallback
}

export function resolveMaterialesBackTo(state, fallback = '/almacen-pt', role = '') {
  if (isSafeAppPath(state?.backTo)) return state.backTo
  return defaultMaterialesBackToForRole(role, fallback)
}

export function buildMaterialesNavState(state = {}, fallback = '/almacen-pt', role = '') {
  return {
    ...state,
    backTo: resolveMaterialesBackTo(state, fallback, role),
  }
}
