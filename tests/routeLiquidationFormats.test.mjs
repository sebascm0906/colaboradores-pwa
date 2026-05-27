import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildRouteFormatsViewModel,
  buildRouteFormatHtml,
} from '../src/modules/admin/routeLiquidationFormats.js'

const CLOSED_DETAIL = {
  id: 77,
  name: 'Plan 77',
  route_name: 'Ruta Centro',
  driver_name: 'Chofer Uno',
  vehicle_name: 'Unidad 12',
  date: '2026-05-27',
  state: 'closed',
  summary: {
    by_method: { cash: 100, credit: 50 },
    total_expected: 150,
    total_collected: 145,
    difference: -5,
  },
  reconciliation_lines: [
    {
      product_name: 'Bolsa 5kg',
      qty_loaded: 10,
      qty_delivered: 7,
      qty_returned: 2,
      qty_scrap: 1,
      qty_difference: 0,
    },
    {
      product_name: 'Bolsa 3kg',
      qty_loaded: 5,
      qty_delivered: 5,
      qty_returned: 0,
      qty_scrap: 0,
      qty_difference: 0,
    },
  ],
}

test('closed route enables formats and normalizes inventory, scrap, corte, liquidation', () => {
  const vm = buildRouteFormatsViewModel(CLOSED_DETAIL)

  assert.equal(vm.enabled, true)
  assert.equal(vm.plan.name, 'Plan 77')
  assert.equal(vm.formats.inventory.rows.length, 2)
  assert.equal(vm.formats.inventory.totals.loaded, 15)
  assert.equal(vm.formats.scrap.rows.length, 1)
  assert.equal(vm.formats.scrap.totals.scrap, 1)
  assert.equal(vm.formats.corte.totals.loaded, 15)
  assert.equal(vm.formats.corte.totals.delivered, 12)
  assert.equal(vm.formats.liquidation.rows.length, 2)
  assert.equal(vm.formats.liquidation.totals.expected, 150)
  assert.equal(vm.formats.liquidation.totals.collected, 145)
  assert.equal(vm.formats.sales.unavailable, true)
})

test('open route blocks formats with a clear reason', () => {
  const vm = buildRouteFormatsViewModel({
    id: 22,
    name: 'Plan abierto',
    state: 'in_progress',
  })

  assert.equal(vm.enabled, false)
  assert.match(vm.blockedReason, /cerrada/i)
})

test('sales format normalizes common backend sales shapes', () => {
  const vm = buildRouteFormatsViewModel({
    ...CLOSED_DETAIL,
    sale_orders: [
      { name: 'S001', customer_name: 'Cliente A', payment_method: 'cash', amount_total: 123.5 },
      { folio: 'S002', partner_name: 'Cliente B', payment_method: 'credit', total: 200 },
    ],
  })

  assert.equal(vm.formats.sales.unavailable, false)
  assert.deepEqual(vm.formats.sales.rows.map((row) => row.folio), ['S001', 'S002'])
  assert.equal(vm.formats.sales.totals.amount, 323.5)
})

test('downloadable html includes escaped plan and selected format content', () => {
  const vm = buildRouteFormatsViewModel({
    ...CLOSED_DETAIL,
    name: 'Plan <especial>',
  })

  const html = buildRouteFormatHtml(vm, 'corte')

  assert.match(html, /<!doctype html>/i)
  assert.match(html, /Plan &lt;especial&gt;/)
  assert.match(html, /Corte/)
  assert.match(html, /Bolsa 5kg/)
  assert.doesNotMatch(html, /<especial>/)
})

test('one page summary includes visits and reloads', () => {
  const vm = buildRouteFormatsViewModel({
    ...CLOSED_DETAIL,
    stops_total: 11,
    stops_done: 10,
    reload_lines: [
      { product_name: 'Bolsa 5kg', quantity: 4, name: 'REC-001', date: '15:20' },
      { product_name: 'Bolsa 3kg', qty_loaded: 3, folio: 'REC-002', time: '16:10' },
    ],
  })

  assert.equal(vm.formatDefinitions[0].id, 'summary')
  assert.equal(vm.formats.summary.visits.planned, 11)
  assert.equal(vm.formats.summary.visits.done, 10)
  assert.equal(vm.formats.summary.visits.notDone, 1)
  assert.equal(vm.formats.summary.visits.compliancePct, 91)
  assert.equal(vm.formats.summary.reloads.rows.length, 2)
  assert.equal(vm.formats.summary.reloads.totals.quantity, 7)
  assert.equal(vm.formats.summary.inventory.rows[0].reloaded, 4)

  const html = buildRouteFormatHtml(vm, 'summary')

  assert.match(html, /Resumen 1 hoja/)
  assert.match(html, /Visitas planificadas/)
  assert.match(html, /Recargas/)
  assert.match(html, /REC-001/)
})
