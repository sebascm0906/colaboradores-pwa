import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTransformationPayload,
  findTransformationInputOption,
  getRoleScopeConfig,
  getVisibleRecipes,
  normalizeTransformationRecipe,
  normalizeTransformationSummary,
  resolveTransformationWarehouseId,
  suggestTransformationOutputQty,
  validateTransformationDraft,
} from '../src/modules/transformaciones/utils/transformationHelpers.js'

test('getRoleScopeConfig returns PT-specific labels and routes', () => {
  const config = getRoleScopeConfig('pt')
  assert.equal(config.title, 'Transformacion')
  assert.equal(config.backTo, '/almacen-pt')
  assert.equal(config.outputUomLabel, 'bolsas')
})

test('getRoleScopeConfig returns Entregas-specific labels and routes', () => {
  const config = getRoleScopeConfig('entregas')
  assert.equal(config.backTo, '/entregas')
  assert.equal(config.outputUomLabel, 'piezas')
})

test('getRoleScopeConfig returns KOLDCUP-specific labels and routes', () => {
  const config = getRoleScopeConfig('koldcup')
  assert.equal(config.title, 'Produccion KOLDCUP')
  assert.equal(config.subtitle, 'Vasos sellados')
  assert.equal(config.backTo, '/koldcup')
  assert.equal(config.outputUomLabel, 'vasos')
  assert.equal(config.apiBase, '/pwa-koldcup')
  assert.equal(config.inputPlaceholder, 'Cantidad consumida')
  assert.equal(config.outputPlaceholder, 'Vasos sellados')
  assert.equal(config.submitLabel, 'Confirmar produccion')
})

test('getVisibleRecipes hides blocked recipes and preserves active ones', () => {
  const recipes = getVisibleRecipes([
    { recipe_code: 'molido_chico', active: true, label: 'Molido chico' },
    null,
    { recipe_code: 'barra_chica_embolsada', active: false, label: 'Barra chica embolsada' },
  ])

  assert.deepEqual(recipes.map((item) => item.recipe_code), ['molido_chico'])
})

test('normalizeTransformationRecipe adapts backend recipe payload to frontend shape', () => {
  const recipe = normalizeTransformationRecipe({
    recipe_code: 'molido_chico',
    name: 'Molido chico',
    input_product_options: [
      { product_id: 725, name: 'Barra grande', recipe_code: 'MCH_GRANDE', output_qty_units_per_input_unit: 2 },
      { product_id: 726, name: 'Barra chica', recipe_code: 'MCH_CHICA', output_qty_units_per_input_unit: 2 },
    ],
    output_product: { product_id: 900, name: 'Molido chico' },
    is_complete: true,
    is_blocked: false,
  })

  assert.equal(recipe.active, true)
  assert.equal(recipe.label, 'Molido chico')
  assert.equal(recipe.input_product_options[0].recipe_code, 'MCH_GRANDE')
  assert.equal(recipe.output_product_id, 900)
})

test('normalizeTransformationRecipe tolerates null recipes from the API', () => {
  const recipe = normalizeTransformationRecipe(null)

  assert.equal(recipe.active, false)
  assert.equal(recipe.label, 'Receta')
  assert.deepEqual(recipe.input_product_options, [])
  assert.equal(recipe.output_product_id, 0)
})

test('normalizeTransformationSummary derives actual output from output_qty_units', () => {
  const summary = normalizeTransformationSummary({
    output_qty_units: 7,
    expected_output_qty_units: 6,
  })

  assert.equal(summary.actual_output_qty_units, 7)
})

test('resolveTransformationWarehouseId falls back to PT default warehouse', () => {
  const warehouseId = resolveTransformationWarehouseId({}, 'pt')

  assert.equal(warehouseId, 76)
})

test('resolveTransformationWarehouseId prefers session warehouse fields', () => {
  assert.equal(resolveTransformationWarehouseId({ warehouse_id: 90 }, 'pt'), 90)
  assert.equal(resolveTransformationWarehouseId({ plant_warehouse_id: 77 }, 'pt'), 77)
  assert.equal(resolveTransformationWarehouseId({ default_source_warehouse_id: 89 }, 'entregas'), 89)
})

test('resolveTransformationWarehouseId falls back to CIGU warehouse for entregas', () => {
  const warehouseId = resolveTransformationWarehouseId({}, 'entregas')

  assert.equal(warehouseId, 89)
})

test('validateTransformationDraft requires recipe, input product, and positive quantities', () => {
  const errors = validateTransformationDraft({
    recipe_code: '',
    input_product_id: 0,
    input_qty_units: 0,
    output_qty_units: 0,
  })

  assert.equal(errors.recipe_code, 'Selecciona una receta')
  assert.equal(errors.input_product_id, 'Selecciona el producto de entrada')
  assert.equal(errors.input_qty_units, 'Captura barras utilizadas')
  assert.equal(errors.output_qty_units, 'Captura salida producida')
})

test('findTransformationInputOption resolves the selected product variant from grouped recipes', () => {
  const recipe = normalizeTransformationRecipe({
    recipe_code: 'MCH',
    name: 'Molido Chico',
    input_product_options: [
      { product_id: 724, name: 'Barra grande', recipe_code: 'MCH_G', output_qty_units_per_input_unit: 2 },
      { product_id: 725, name: 'Barra chica', recipe_code: 'MCH_C', output_qty_units_per_input_unit: 2 },
    ],
  })

  const option = findTransformationInputOption(recipe, 725)

  assert.equal(option.recipe_code, 'MCH_C')
  assert.equal(option.name, 'Barra chica')
})

test('suggestTransformationOutputQty uses the selected recipe variant ratio', () => {
  const recipe = normalizeTransformationRecipe({
    recipe_code: 'KB13',
    name: 'Kold Barrita 13kg',
    input_product_options: [
      { product_id: 724, name: 'Barra grande', recipe_code: 'KB13', output_qty_units_per_input_unit: 5 },
    ],
  })

  assert.equal(suggestTransformationOutputQty(recipe, 724, 3), 15)
})

test('buildTransformationPayload normalizes integers and trims notes', () => {
  const payload = buildTransformationPayload({
    warehouseId: 76,
    employeeId: 11,
    roleScope: 'pt',
    recipeCode: 'molido_chico',
    resolvedRecipeCode: 'molido_chico_alt',
    inputProductId: '725',
    inputQtyUnits: '2',
    outputQtyUnits: '3',
    notes: '  observacion  ',
  })

  assert.deepEqual(payload, {
    warehouse_id: 76,
    employee_id: 11,
    role_scope: 'pt',
    recipe_code: 'molido_chico_alt',
    input_product_id: 725,
    input_qty_units: 2,
    output_qty_units: 3,
    notes: 'observacion',
  })
})
