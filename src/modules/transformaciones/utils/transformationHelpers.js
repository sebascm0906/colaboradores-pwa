const ROLE_SCOPE_CONFIG = {
  pt: {
    title: 'Transformacion',
    subtitle: 'Molidos y barra chica',
    backTo: '/almacen-pt',
    outputUomLabel: 'bolsas',
    apiBase: '/pwa-pt',
  },
  entregas: {
    title: 'Transformacion',
    subtitle: 'Medias barras',
    backTo: '/entregas',
    outputUomLabel: 'piezas',
    apiBase: '/pwa-entregas',
  },
}

export function getRoleScopeConfig(roleScope) {
  return ROLE_SCOPE_CONFIG[roleScope] || ROLE_SCOPE_CONFIG.pt
}

export function getVisibleRecipes(recipes = []) {
  return (Array.isArray(recipes) ? recipes : []).filter((recipe) => recipe?.active)
}

export function validateTransformationDraft(draft = {}) {
  const errors = {}
  if (!draft.recipe_code) errors.recipe_code = 'Selecciona una receta'
  if (!Number(draft.input_product_id || 0)) errors.input_product_id = 'Selecciona el producto de entrada'
  if (Number(draft.input_qty_units || 0) <= 0) errors.input_qty_units = 'Captura barras utilizadas'
  if (Number(draft.output_qty_units || 0) <= 0) errors.output_qty_units = 'Captura salida producida'
  return errors
}

export function buildTransformationPayload({
  warehouseId,
  employeeId,
  roleScope,
  recipeCode,
  inputProductId,
  inputQtyUnits,
  outputQtyUnits,
  notes,
}) {
  return {
    warehouse_id: Number(warehouseId || 0),
    employee_id: Number(employeeId || 0),
    role_scope: roleScope,
    recipe_code: recipeCode,
    input_product_id: Number(inputProductId || 0),
    input_qty_units: Number(inputQtyUnits || 0),
    output_qty_units: Number(outputQtyUnits || 0),
    notes: String(notes || '').trim(),
  }
}
