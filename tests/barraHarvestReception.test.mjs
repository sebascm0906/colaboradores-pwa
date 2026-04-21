import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPtReceptionFromHarvest,
  resolveHarvestProduct,
  resolveHarvestShiftId,
} from '../src/modules/produccion/barraHarvestReception.js'

test('resolveHarvestProduct prefers slot product over tank product', () => {
  const product = resolveHarvestProduct({
    slot: { product_id: 725, product_name: 'Barra Chica (50 kg)' },
    tank: { product_id: 724, product_name: 'Barra Grande (75 kg)' },
  })

  assert.deepEqual(product, { product_id: 725, product_name: 'Barra Chica (50 kg)' })
})

test('resolveHarvestProduct falls back to tank product when slot product is missing', () => {
  const product = resolveHarvestProduct({
    slot: { product_id: null, product_name: '' },
    tank: { product_id: 724, product_name: 'Barra Grande (75 kg)' },
  })

  assert.deepEqual(product, { product_id: 724, product_name: 'Barra Grande (75 kg)' })
})

test('buildPtReceptionFromHarvest creates a PT payload with fixed qty_reported of 8 bars', () => {
  const payload = buildPtReceptionFromHarvest({
    slot: { id: 33, name: 'A1', product_id: 724, product_name: 'Barra Grande (75 kg)' },
    tank: { id: 1, display_name: 'Tanque 1' },
  })

  assert.equal(payload.product_id, 724)
  assert.equal(payload.product_name, 'Barra Grande (75 kg)')
  assert.equal(payload.qty_reported, 8)
  assert.match(payload.notes, /A1/)
})

test('buildPtReceptionFromHarvest preserves missing product as invalid payload for caller handling', () => {
  const payload = buildPtReceptionFromHarvest({
    slot: { id: 33, name: 'A1', product_id: null, product_name: '' },
    tank: { id: 1, display_name: 'Tanque 1', product_id: null, product_name: '' },
  })

  assert.equal(payload.product_id, 0)
  assert.equal(payload.qty_reported, 8)
})

test('buildPtReceptionFromHarvest creates notes mentioning slot and PT reception intent', () => {
  const payload = buildPtReceptionFromHarvest({
    slot: { id: 44, name: 'B2', product_id: 725, product_name: 'Barra Chica (50 kg)' },
    tank: { id: 1, display_name: 'Tanque 1' },
  })

  assert.match(payload.notes, /B2/)
  assert.match(payload.notes, /Tanque 1/)
})

test('resolveHarvestShiftId prefers slot shift_id when available', () => {
  assert.equal(
    resolveHarvestShiftId({
      slot: { shift_id: 55 },
      activeShift: { id: 88 },
    }),
    55,
  )
})

test('resolveHarvestShiftId falls back to active shift when slot shift_id is missing', () => {
  assert.equal(
    resolveHarvestShiftId({
      slot: { shift_id: null },
      activeShift: { id: 88 },
    }),
    88,
  )
})
