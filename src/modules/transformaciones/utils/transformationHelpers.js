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

export function normalizeTransformationRecipe(recipe = {}) {
  const inputProduct = recipe.input_product || null
  const outputProduct = recipe.output_product || null
  const active = typeof recipe.active === 'boolean'
    ? recipe.active
    : Boolean(recipe.is_complete) && !Boolean(recipe.is_blocked)

  return {
    ...recipe,
    active,
    label: recipe.label || recipe.name || recipe.recipe_code || 'Receta',
    block_reason: recipe.blocked_reason || recipe.block_reason || '',
    input_product_options: recipe.input_product_options
      || (inputProduct?.product_id ? [inputProduct] : []),
    output_product_id: recipe.output_product_id || outputProduct?.product_id || 0,
  }
}

export function normalizeTransformationSummary(summary = {}) {
  const outputLines = Array.isArray(summary.output_lines) ? summary.output_lines : []
  const fallbackReal = outputLines.reduce((total, line) => total + Number(line?.qty || 0), 0)

  return {
    ...summary,
    actual_output_qty_units: summary.actual_output_qty_units ?? summary.output_qty_units ?? fallbackReal,
  }
}

export function getVisibleRecipes(recipes = []) {
  return (Array.isArray(recipes) ? recipes : [])
    .map((recipe) => normalizeTransformationRecipe(recipe))
    .filter((recipe) => recipe.active)
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
