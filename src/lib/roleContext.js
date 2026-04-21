const MODULE_ROLE_VARIANTS = {
  registro_produccion: ['operador_barra', 'operador_rolito', 'auxiliar_produccion'],
  admin_sucursal: ['auxiliar_admin', 'gerente_sucursal', 'direccion_general'],
}

// ─── WAREHOUSE → PLAZA (fallback defensivo para Fase 0 voice PoC) ───────────
// El emisor del JWT aun no incluye plaza_id; derivamos desde warehouse_id que
// si viaja. Alinea con hardcoded plazas de W121 load_plaza_list.
// Fuente: stock.warehouse en grupofrio.odoo.com (verificado 2026-04-21).
// Extensible para mas plazas; no match => plaza_id null (W120 degrada con
// meta.catalog_fallback:true, no rompe el flujo).
const PLAZA_BY_WAREHOUSE = {
  // IGUALA (piloto primario)
  49: 'IGUALA', 50: 'IGUALA', 51: 'IGUALA', 52: 'IGUALA', 53: 'IGUALA',
  54: 'IGUALA', 76: 'IGUALA', 89: 'IGUALA',
  // MORELIA
  2: 'MORELIA', 45: 'MORELIA', 46: 'MORELIA', 47: 'MORELIA', 48: 'MORELIA',
  // GUADALAJARA
  55: 'GUADALAJARA', 56: 'GUADALAJARA', 113: 'GUADALAJARA',
  // TOLUCA
  57: 'TOLUCA', 58: 'TOLUCA', 59: 'TOLUCA',
  // ZIHUATANEJO
  60: 'ZIHUATANEJO', 61: 'ZIHUATANEJO',
  // MANZANILLO
  62: 'MANZANILLO',
}

function derivePlazaId(session = {}) {
  const explicit = String(session?.plaza_id || '').trim()
  if (explicit) return explicit.toUpperCase()
  const wh = Number(session?.warehouse_id || 0)
  if (wh && Object.prototype.hasOwnProperty.call(PLAZA_BY_WAREHOUSE, wh)) {
    return PLAZA_BY_WAREHOUSE[wh]
  }
  return null
}

export const ROLE_LABELS = {
  operador_barra: 'Operador barra',
  operador_rolito: 'Operador rolito',
  auxiliar_produccion: 'Auxiliar producción',
  supervisor_produccion: 'Supervisor producción',
  almacenista_pt: 'Almacenista PT',
  jefe_ruta: 'Jefe ruta',
  auxiliar_ruta: 'Auxiliar ruta',
  almacenista_entregas: 'Almacenista entregas',
  supervisor_ventas: 'Supervisor ventas',
  auxiliar_admin: 'Auxiliar admin',
  gerente_sucursal: 'Gerente sucursal',
  direccion_general: 'Dirección general',
  operador_torres: 'Operador torres',
}

export function normalizeJobKeys(values = []) {
  const keys = Array.isArray(values) ? values : [values]
  const seen = new Set()
  return keys
    .map((value) => String(value || '').trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false
      seen.add(value)
      return true
    })
}

export function normalizeSessionRoleContext(session = {}) {
  const primaryRole = String(session?.role || '').trim()
  const rawAdditionalRoles = Array.isArray(session?.additional_job_keys)
    ? session.additional_job_keys
    : session?.additional_roles
  const additional_job_keys = normalizeJobKeys(rawAdditionalRoles)
    .filter((role) => role !== primaryRole)

  const module_role_contexts = Object.fromEntries(
    Object.entries(session?.module_role_contexts || {})
      .map(([moduleId, role]) => [String(moduleId || '').trim(), String(role || '').trim()])
      .filter(([moduleId, role]) => moduleId && role)
  )

  return {
    ...session,
    role: primaryRole,
    additional_job_keys,
    module_role_contexts,
    plaza_id: derivePlazaId(session),
  }
}

export function getEffectiveJobKeys(session = {}) {
  return normalizeJobKeys([session?.role || '', ...(session?.additional_job_keys || [])])
}

export function getCompatibleModuleRoles(module, effectiveRoles = []) {
  const normalizedRoles = normalizeJobKeys(effectiveRoles)
  const moduleRoles = Array.isArray(module?.roles) ? module.roles : []
  const variantRoles = Array.isArray(module?.roleContextRoles) && module.roleContextRoles.length
    ? module.roleContextRoles
    : MODULE_ROLE_VARIANTS[module?.id] || []

  const visibleRoles = normalizedRoles.filter((role) => moduleRoles.includes('*') || moduleRoles.includes(role))
  if (!variantRoles.length) return visibleRoles
  return visibleRoles.filter((role) => variantRoles.includes(role))
}

export function resolveModuleContextRole(session = {}, module, requestedRole = '') {
  const compatibleRoles = getCompatibleModuleRoles(module, getEffectiveJobKeys(session))
  const explicitRole = String(requestedRole || '').trim()
  if (explicitRole && compatibleRoles.includes(explicitRole)) return explicitRole
  const storedRole = String(session?.module_role_contexts?.[module?.id] || '').trim()
  if (storedRole && compatibleRoles.includes(storedRole)) return storedRole
  if (compatibleRoles.length === 1) return compatibleRoles[0]
  return ''
}

export function getModuleEntryDecision(module, session = {}) {
  const compatibleRoles = getCompatibleModuleRoles(module, getEffectiveJobKeys(session))
  if (!compatibleRoles.length) {
    return { type: 'denied', compatibleRoles: [], selectedRole: '' }
  }

  const selectedRole = resolveModuleContextRole(session, module)
  if (selectedRole) {
    return { type: 'direct', compatibleRoles, selectedRole }
  }

  return { type: 'choose', compatibleRoles, selectedRole: '' }
}

export function upsertModuleRoleContext(contexts = {}, moduleId, role) {
  const normalizedRole = String(role || '').trim()
  const nextContexts = { ...(contexts || {}) }
  if (!moduleId) return nextContexts
  if (!normalizedRole) {
    delete nextContexts[moduleId]
    return nextContexts
  }
  nextContexts[moduleId] = normalizedRole
  return nextContexts
}
