import { api } from '../../../lib/api'
import {
  getRoleScopeConfig,
  normalizeTransformationRecipe,
  normalizeTransformationSummary,
} from '../utils/transformationHelpers'

export async function getTransformationCatalog(roleScope, warehouseId, employeeId) {
  const { apiBase } = getRoleScopeConfig(roleScope)
  const result = await api('GET', `${apiBase}/transformation-catalog?warehouse_id=${warehouseId}&employee_id=${employeeId}&role_scope=${roleScope}`)
  const recipes = result?.recipes || result?.data?.recipes || result?.data || result || []
  return (Array.isArray(recipes) ? recipes : []).map((recipe) => normalizeTransformationRecipe(recipe))
}

export async function getTransformationHistory(roleScope, warehouseId, employeeId, date) {
  const { apiBase } = getRoleScopeConfig(roleScope)
  const queryDate = date ? `&date=${encodeURIComponent(date)}` : ''
  const result = await api('GET', `${apiBase}/transformation-history?warehouse_id=${warehouseId}&employee_id=${employeeId}&role_scope=${roleScope}${queryDate}`)
  const history = result?.transformations || result?.data?.transformations || result?.data || result || []
  return (Array.isArray(history) ? history : []).map((item) => normalizeTransformationSummary(item))
}

export async function createTransformation(payload) {
  const { apiBase } = getRoleScopeConfig(payload.role_scope)
  const result = await api('POST', `${apiBase}/transformation-create`, payload)
  return normalizeTransformationSummary(result?.data || result || {})
}

export async function cancelTransformation(roleScope, transformationId, employeeId, reason) {
  const { apiBase } = getRoleScopeConfig(roleScope)
  const result = await api('POST', `${apiBase}/transformation-cancel`, {
    transformation_id: transformationId,
    employee_id: employeeId,
    reason,
  })
  return normalizeTransformationSummary(result?.data || result || {})
}
