import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTransformationPayload,
  getRoleScopeConfig,
  getVisibleRecipes,
  normalizeTransformationRecipe,
  normalizeTransformationSummary,
  resolveTransformationWarehouseId,
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

test('getVisibleRecipes hides blocked recipes and preserves active ones', () => {
  const recipes = getVisibleRecipes([
    { recipe_code: 'molido_chico', active: true, label: 'Molido chico' },
    { recipe_code: 'barra_chica_embolsada', active: false, label: 'Barra chica embolsada' },
  ])

  assert.deepEqual(recipes.map((item) => item.recipe_code), ['molido_chico'])
})

test('normalizeTransformationRecipe adapts backend recipe payload to frontend shape', () => {
  const recipe = normalizeTransformationRecipe({
    recipe_code: 'molido_chico',
    name: 'Molido chico',
    input_product: { product_id: 725, name: 'Barra grande' },
    output_product: { product_id: 900, name: 'Molido chico' },
    is_complete: true,
    is_blocked: false,
  })

  assert.equal(recipe.active, true)
  assert.equal(recipe.label, 'Molido chico')
  assert.deepEqual(recipe.input_product_options, [{ product_id: 725, name: 'Barra grande' }])
  assert.equal(recipe.output_product_id, 900)
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

test('buildTransformationPayload normalizes integers and trims notes', () => {
  const payload = buildTransformationPayload({
    warehouseId: 76,
    employeeId: 11,
    roleScope: 'pt',
    recipeCode: 'molido_chico',
    inputProductId: '725',
    inputQtyUnits: '2',
    outputQtyUnits: '3',
    notes: '  observacion  ',
  })

  assert.deepEqual(payload, {
    warehouse_id: 76,
    employee_id: 11,
    role_scope: 'pt',
    recipe_code: 'molido_chico',
    input_product_id: 725,
    input_qty_units: 2,
    output_qty_units: 3,
    notes: 'observacion',
  })
})
