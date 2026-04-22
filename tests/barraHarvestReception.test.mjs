import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPtReceptionFromHarvest,
  resolveHarvestProduct,
  resolveHarvestShiftId,
} from '../src/modules/produccion/barraHarvestReception.js'

test('resolveHarvestProduct prefers slot product over tank product when canister product exists', () => {
  const product = resolveHarvestProduct({
    slot: { product_id: 725, product_name: 'Barra Chica (50 kg)' },
    tank: { product_id: 724, product_name: 'Barra Grande (75 kg)' },
  })

  assert.deepEqual(product, { product_id: 725, product_name: 'Barra Chica (50 kg)', source: 'slot' })
})

test('resolveHarvestProduct falls back to slot product when PT product is missing on tank', () => {
  const product = resolveHarvestProduct({
    slot: { product_id: 725, product_name: 'MP Barra Chica (50 kg)' },
    tank: { product_id: null, product_name: '' },
  })

  assert.deepEqual(product, { product_id: 725, product_name: 'MP Barra Chica (50 kg)', source: 'slot' })
})

test('buildPtReceptionFromHarvest creates a PT payload with fixed qty_reported of 8 bars', () => {
  const payload = buildPtReceptionFromHarvest({
    slot: { id: 33, name: 'A1', product_id: 900, product_name: 'MP Barra Grande' },
    tank: { id: 1, display_name: 'Tanque 1', product_id: 724, product_name: 'Barra Grande (75 kg)' },
  })

  assert.equal(payload.product_id, 900)
  assert.equal(payload.product_name, 'MP Barra Grande')
  assert.equal(payload.qty_reported, 8)
  assert.equal(payload.source_product_id, 900)
  assert.equal(payload.source_product_name, 'MP Barra Grande')
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
    slot: { id: 44, name: 'B2', product_id: 812, product_name: 'MP Barra Chica' },
    tank: { id: 1, display_name: 'Tanque 1', product_id: 725, product_name: 'Barra Chica (50 kg)' },
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
