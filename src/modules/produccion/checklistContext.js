import { getModuleById } from '../registry.js'
import { resolveModuleContextRole } from '../../lib/roleContext.js'

export function resolveChecklistRoleContext(session = {}, requestedRole = '') {
  return resolveModuleContextRole(
    session,
    getModuleById('registro_produccion'),
    requestedRole,
  ) || String(session?.role || '').trim()
}

export function resolveChecklistLineType(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized.includes('rolito')) return 'rolito'
  if (normalized.includes('barra')) return 'barras'
  return 'all'
}

export function buildChecklistPath(shiftId, roleContext = '') {
  const params = new URLSearchParams()
  params.set('shift_id', String(shiftId))
  if (roleContext) {
    params.set('role_context', roleContext)
    const lineType = resolveChecklistLineType(roleContext)
    if (lineType !== 'all') params.set('line_type', lineType)
  }
  return `/pwa-prod/checklist?${params.toString()}`
}
