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
  // gerente_sucursal NO se mapea a /admin: las pantallas de materiales ya
  // no son del gerente (Validar materiales/bolsas se eliminaron 2026-04-25).
  // Si un operador tiene tambien rol gerente, el back NO debe mandarlo al
  // panel admin — fallback al hub general '/' cae en home con sus modulos.
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
