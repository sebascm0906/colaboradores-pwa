const ROLE_SCOPE_CONFIG = {
  pt: {
    title: 'Transformacion',
    subtitle: 'Molidos y barra chica',
    backTo: '/almacen-pt',
    outputUomLabel: 'bolsas',
    apiBase: '/pwa-pt',
    defaultWarehouseId: 76,
  },
  entregas: {
    title: 'Transformacion',
    subtitle: 'Medias barras',
    backTo: '/entregas',
    outputUomLabel: 'piezas',
    apiBase: '/pwa-entregas',
    defaultWarehouseId: 0,
  },
  koldcup: {
    title: 'Produccion KOLDCUP',
    subtitle: 'Vasos sellados',
    backTo: '/koldcup',
    outputUomLabel: 'vasos',
    inputPlaceholder: 'Cantidad consumida',
    outputPlaceholder: 'Vasos sellados',
    submitLabel: 'Confirmar produccion',
    apiBase: '/pwa-koldcup',
    defaultWarehouseId: 0,
  },
}

export function getRoleScopeConfig(roleScope) {
  return ROLE_SCOPE_CONFIG[roleScope] || ROLE_SCOPE_CONFIG.pt
}

function isRecipeLike(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function resolveTransformationWarehouseId(session = {}, roleScope) {
  return Number(
    session?.warehouse_id
    || session?.plant_warehouse_id
    || getRoleScopeConfig(roleScope).defaultWarehouseId
    || 0
  ) || 0
}

export function normalizeTransformationRecipe(recipe = {}) {
  const source = isRecipeLike(recipe) ? recipe : {}
  const inputProduct = source.input_product || null
  const outputProduct = source.output_product || null
  const active = typeof source.active === 'boolean'
    ? source.active
    : Boolean(source.is_complete) && !Boolean(source.is_blocked)
  const inputOptions = Array.isArray(source.input_product_options) && source.input_product_options.length
    ? source.input_product_options
    : (inputProduct?.product_id ? [inputProduct] : [])

  return {
    ...source,
    active,
    label: source.label || source.name || source.recipe_code || 'Receta',
    block_reason: source.blocked_reason || source.block_reason || '',
    input_product_options: inputOptions.map((option) => ({
      ...option,
      product_id: Number(option?.product_id || 0),
      recipe_code: option?.recipe_code || source.recipe_code || '',
      output_qty_units_per_input_unit: Number(
        option?.output_qty_units_per_input_unit
        ?? option?.expected_output_qty_units_per_input_unit
        ?? 0,
      ) || 0,
    })),
    output_product_id: source.output_product_id || outputProduct?.product_id || 0,
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
    .filter((recipe) => isRecipeLike(recipe))
    .map((recipe) => normalizeTransformationRecipe(recipe))
    .filter((recipe) => recipe.active)
}

export function findTransformationInputOption(recipe = {}, inputProductId) {
  const normalized = normalizeTransformationRecipe(recipe)
  const targetId = Number(inputProductId || 0)
  if (!targetId) return null
  return normalized.input_product_options.find((option) => Number(option.product_id || 0) === targetId) || null
}

export function suggestTransformationOutputQty(recipe = {}, inputProductId, inputQtyUnits) {
  const option = findTransformationInputOption(recipe, inputProductId)
  const qty = Number(inputQtyUnits || 0)
  const ratio = Number(option?.output_qty_units_per_input_unit || 0)
  if (!option || qty <= 0 || ratio <= 0) return 0
  return qty * ratio
}

export function validateTransformationDraft(draft = {}, recipe = null) {
  const errors = {}
  if (!draft.recipe_code) errors.recipe_code = 'Selecciona una receta'
  if (!Number(draft.input_product_id || 0)) errors.input_product_id = 'Selecciona el producto de entrada'
  if (recipe && draft.input_product_id && !findTransformationInputOption(recipe, draft.input_product_id)) {
    errors.input_product_id = 'Selecciona un producto de entrada valido para esta receta'
  }
  if (Number(draft.input_qty_units || 0) <= 0) errors.input_qty_units = 'Captura barras utilizadas'
  if (Number(draft.output_qty_units || 0) <= 0) errors.output_qty_units = 'Captura salida producida'
  return errors
}

export function buildTransformationPayload({
  warehouseId,
  employeeId,
  roleScope,
  recipeCode,
  resolvedRecipeCode,
  inputProductId,
  inputQtyUnits,
  outputQtyUnits,
  notes,
}) {
  return {
    warehouse_id: Number(warehouseId || 0),
    employee_id: Number(employeeId || 0),
    role_scope: roleScope,
    recipe_code: resolvedRecipeCode || recipeCode,
    input_product_id: Number(inputProductId || 0),
    input_qty_units: Number(inputQtyUnits || 0),
    output_qty_units: Number(outputQtyUnits || 0),
    notes: String(notes || '').trim(),
  }
}
