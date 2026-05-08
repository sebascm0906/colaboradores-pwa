import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildBarHarvestScrapNotes,
  buildPtReceptionFromHarvest,
  resolveBarHarvestQuantities,
  resolveHarvestProduct,
  resolvePackedProductFromHarvest,
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

test('resolveBarHarvestQuantities subtracts mermada bars from PT reception quantity', () => {
  const quantities = resolveBarHarvestQuantities({
    tank: { bars_per_basket: 8, kg_per_bar: 50 },
    scrapBars: 2,
  })

  assert.deepEqual(quantities, {
    valid: true,
    error: '',
    totalBars: 8,
    scrapBars: 2,
    goodBars: 6,
    kgPerBar: 50,
    scrapKg: 100,
    goodKg: 300,
  })
})

test('buildPtReceptionFromHarvest reports only good bars when harvest has merma', () => {
  const payload = buildPtReceptionFromHarvest({
    slot: { id: 33, name: 'A1', product_id: 900, product_name: 'MP Barra Grande' },
    tank: { id: 1, display_name: 'Tanque 1', product_id: 724, product_name: 'Barra Grande (75 kg)', bars_per_basket: 8 },
    scrapBars: 3,
  })

  assert.equal(payload.qty_reported, 5)
  assert.equal(payload.total_bars, 8)
  assert.equal(payload.scrap_bars, 3)
  assert.equal(payload.good_bars, 5)
  assert.match(payload.notes, /3 mermadas/)
})

test('buildPtReceptionFromHarvest allows all bars to be mermadas without PT quantity', () => {
  const payload = buildPtReceptionFromHarvest({
    slot: { id: 33, name: 'A1', product_id: 900, product_name: 'MP Barra Grande' },
    tank: { id: 1, display_name: 'Tanque 1', bars_per_basket: 8, kg_per_bar: 50 },
    scrapBars: 8,
  })

  assert.equal(payload.qty_reported, 0)
  assert.equal(payload.scrap_bars, 8)
  assert.equal(payload.good_bars, 0)
})

test('resolveBarHarvestQuantities rejects fractional or excessive merma bars', () => {
  assert.deepEqual(
    resolveBarHarvestQuantities({ tank: { bars_per_basket: 8 }, scrapBars: 1.5 }),
    {
      valid: false,
      error: 'Las barras mermadas deben ser un numero entero',
      totalBars: 8,
      scrapBars: 1.5,
      goodBars: 0,
      kgPerBar: 0,
      scrapKg: 0,
      goodKg: 0,
    },
  )

  assert.deepEqual(
    resolveBarHarvestQuantities({ tank: { bars_per_basket: 8 }, scrapBars: 9 }),
    {
      valid: false,
      error: 'Las barras mermadas no pueden exceder 8',
      totalBars: 8,
      scrapBars: 9,
      goodBars: 0,
      kgPerBar: 0,
      scrapKg: 0,
      goodKg: 0,
    },
  )
})

test('buildBarHarvestScrapNotes includes canister, tank, good bars and mermada bars', () => {
  const notes = buildBarHarvestScrapNotes({
    slot: { name: 'B4' },
    tank: { display_name: 'Tanque 3 Iguala' },
    quantities: { scrapBars: 2, goodBars: 6, totalBars: 8, scrapKg: 100 },
  })

  assert.match(notes, /B4/)
  assert.match(notes, /Tanque 3 Iguala/)
  assert.match(notes, /2 barras mermadas/)
  assert.match(notes, /6 barras buenas/)
  assert.match(notes, /100 kg/)
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

test('resolvePackedProductFromHarvest prefers the product returned by action_cosechar over the preview fallback', () => {
  const product = resolvePackedProductFromHarvest({
    harvestResult: {
      product_id: 725,
      product_name: 'BARRA DE HIELO CHICA (50KG)',
    },
    fallbackProduct: {
      product_id: 763,
      product_name: 'MP BARRA DE HIELO',
    },
  })

  assert.deepEqual(product, {
    product_id: 725,
    product_name: 'BARRA DE HIELO CHICA (50KG)',
    source: 'harvest',
  })
})

test('resolvePackedProductFromHarvest falls back when action_cosechar does not return product info', () => {
  const product = resolvePackedProductFromHarvest({
    harvestResult: { success: true },
    fallbackProduct: {
      product_id: 763,
      product_name: 'MP BARRA DE HIELO',
    },
  })

  assert.deepEqual(product, {
    product_id: 763,
    product_name: 'MP BARRA DE HIELO',
    source: 'fallback',
  })
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
