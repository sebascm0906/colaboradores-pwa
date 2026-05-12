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

export function getChecklistTemplateLineTypeCandidates(lineType = '') {
  const normalized = String(lineType || '').trim().toLowerCase()
  if (normalized === 'rolito' || normalized === 'barras') return [normalized, 'all']
  if (normalized === 'transformacion') return [normalized, 'all']
  return ['all']
}

export function selectChecklistForShift(checklists = []) {
  const rows = Array.isArray(checklists) ? checklists : []
  return rows.find((checklist) => checklist?.state === 'completed') || rows[0] || null
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

export function buildChecklistCacheKey(shiftId, roleContext = '', lineType = '') {
  return [
    'checklist',
    String(shiftId || ''),
    String(roleContext || '').trim().toLowerCase(),
    String(lineType || '').trim().toLowerCase(),
  ].join(':')
}

export function resolveChecklistBackTarget(state = {}, fallback = '/produccion') {
  const backTo = String(state?.backTo || '').trim()
  if (backTo.startsWith('/') && !backTo.startsWith('//')) return backTo
  return fallback
}

export function shouldBackfillShiftChecklistLink(checklist = {}, shift = {}, linkedChecklist = null) {
  const checklistId = Number(checklist?.id || 0)
  const shiftId = Number(Array.isArray(checklist?.shift_id) ? checklist.shift_id[0] : checklist?.shift_id || 0)
  const linkedRaw = Array.isArray(shift?.haccp_checklist_id) ? shift.haccp_checklist_id[0] : shift?.haccp_checklist_id
  const linkedId = Number(linkedRaw || 0)
  if (!checklistId || !shiftId || checklist?.state !== 'completed') return false
  if (!linkedId) return true
  if (linkedId === checklistId) return false
  return Boolean(linkedChecklist && linkedChecklist.state !== 'completed')
}
