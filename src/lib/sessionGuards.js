// ─── sessionGuards — validación de sesión para eliminar fallbacks peligrosos ─
// Reemplaza patrones como `warehouse_id || 89`, `company_id || 34`,
// `employee_id || 0` con guards explícitos que lanzan error y disparan
// el evento global `gf:session-expired` (App.jsx lo escucha y redirige a login).
//
// Uso:
//   const warehouseId = requireWarehouse(session)
//   const companyId   = requireCompany(session)
//   const employeeId  = requireEmployee(session)
//
// Si cualquiera falta:
//   - Lanza SessionIncompleteError (capturable en try/catch)
//   - Si se llama sin try/catch, el ErrorBoundary la atrapa
//   - Adicionalmente, dispara `gf:session-expired` para forzar re-login

/** Error específico para sesión incompleta. No confundir con token expirado. */
export class SessionIncompleteError extends Error {
  constructor(missing) {
    super(`Sesión incompleta: falta ${missing}`)
    this.name = 'SessionIncompleteError'
    this.missing = missing
    this.userMessage = `No se pudo cargar la pantalla porque tu sesión no tiene "${missing}". Vuelve a iniciar sesión.`
  }
}

function resolveWarehouseId(session) {
  return Number(
    session?.warehouse_id
    || session?.plant_warehouse_id
    || session?.default_source_warehouse_id
    || 0,
  ) || 0
}

function fireSessionExpired(reason) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('gf:session-expired', { detail: { reason } }))
    } catch { /* no-op en SSR */ }
  }
}

/**
 * Extrae y valida el warehouse_id de la sesión.
 * Si no existe, lanza error (NO fallback silencioso a 89).
 */
export function requireWarehouse(session) {
  const id = resolveWarehouseId(session)
  if (!Number.isFinite(id) || id <= 0) {
    fireSessionExpired('no_warehouse')
    throw new SessionIncompleteError('warehouse_id')
  }
  return id
}

/** Extrae y valida el company_id. Sin fallback silencioso a 34. */
export function requireCompany(session) {
  const id = Number(session?.company_id || 0)
  if (!Number.isFinite(id) || id <= 0) {
    fireSessionExpired('no_company')
    throw new SessionIncompleteError('company_id')
  }
  return id
}

/** Extrae y valida el employee_id. Sin fallback silencioso a 0. */
export function requireEmployee(session) {
  const id = Number(session?.employee_id || 0)
  if (!Number.isFinite(id) || id <= 0) {
    fireSessionExpired('no_employee')
    throw new SessionIncompleteError('employee_id')
  }
  return id
}

/** Soft variants — devuelven null si falta (para pantallas opcionales) sin disparar evento. */
export function softWarehouse(session) {
  const id = resolveWarehouseId(session)
  return Number.isFinite(id) && id > 0 ? id : null
}
export function softCompany(session) {
  const id = Number(session?.company_id || 0)
  return Number.isFinite(id) && id > 0 ? id : null
}
export function softEmployee(session) {
  const id = Number(session?.employee_id || 0)
  return Number.isFinite(id) && id > 0 ? id : null
}

/** Retorna info completa de la sesión validada. Útil en pantallas que requieren todo. */
export function requireFullContext(session) {
  return {
    warehouseId: requireWarehouse(session),
    companyId: requireCompany(session),
    employeeId: requireEmployee(session),
    role: session?.role || '',
    name: session?.name || '',
    sucursal: session?.sucursal || '',
  }
}
