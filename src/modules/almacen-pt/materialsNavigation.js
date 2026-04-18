function isSafeAppPath(value) {
  return typeof value === 'string' && value.startsWith('/')
}

export function resolveMaterialesBackTo(state, fallback = '/almacen-pt') {
  if (isSafeAppPath(state?.backTo)) return state.backTo
  return fallback
}

export function buildMaterialesNavState(state = {}, fallback = '/almacen-pt') {
  return {
    ...state,
    backTo: resolveMaterialesBackTo(state, fallback),
  }
}
