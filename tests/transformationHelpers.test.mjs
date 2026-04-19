import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTransformationPayload,
  getRoleScopeConfig,
  getVisibleRecipes,
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
