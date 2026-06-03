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
  cash_received_amount: 100,
  summary: {
    by_method: { cash: 100, credit: 50 },
    payments: { cash: { total: 100 }, credit: { total: 0 } },
    expected_payments: { cash: { total: 100 }, credit: { total: 50 }, transfer: { total: 0 } },
    total_expected: 150,
    total_collected: 150,
    difference: -50,
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
  assert.equal(vm.formats.liquidation.totals.collected, 150)
  assert.equal(vm.formats.liquidation.totals.credit, 50)
  assert.equal(vm.formats.liquidation.totals.cashExpected, 100)
  assert.equal(vm.formats.liquidation.totals.cashReceived, 100)
  assert.equal(vm.formats.liquidation.totals.difference, 0)
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
      {
        name: 'S001',
        customer_name: 'Cliente A',
        payment_method: 'cash',
        amount_total: 123.5,
        lines: [{ quantity: 2, weight: 5.5 }],
      },
      { folio: 'S002', partner_name: 'Cliente B', payment_method: 'credit', total: 200, kg_total: 3 },
    ],
  })

  assert.equal(vm.formats.sales.unavailable, false)
  assert.deepEqual(vm.formats.sales.rows.map((row) => row.folio), ['S001', 'S002'])
  assert.equal(vm.formats.sales.totals.amount, 323.5)
  assert.equal(vm.formats.sales.totals.kilos, 14)
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

  const html = buildRouteFormatHtml(vm, 'summary')

  assert.match(html, /Resumen 1 hoja/)
  assert.match(html, /Visitas planificadas/)
  assert.match(html, /Recargas/)
  assert.match(html, /REC-001/)
})

test('one page summary includes planned and visited customer list with visit time', () => {
  const vm = buildRouteFormatsViewModel({
    ...CLOSED_DETAIL,
    stops: [
      {
        id: 1,
        sequence: 2,
        customer_name: 'Cliente Visitado',
        planned_time: '10:00',
        actual_start_time: '2026-05-27 10:18:00',
        result_status: 'visited',
        has_sale: true,
      },
      {
        id: 2,
        sequence: 1,
        customer: 'Cliente Planeado',
        scheduled_time: '09:30',
        result_status: 'not_visited',
        has_sale: false,
      },
    ],
  })

  assert.equal(vm.formats.summary.visitList.empty, false)
  assert.deepEqual(vm.formats.summary.visitList.rows.map((row) => row.customer), [
    'Cliente Planeado',
    'Cliente Visitado',
  ])
  assert.equal(vm.formats.summary.visitList.rows[0].visitTime, '')
  assert.equal(vm.formats.summary.visitList.rows[0].status, 'Sin visita')
  assert.equal(vm.formats.summary.visitList.rows[0].saleStatus, 'No venta')
  assert.equal(vm.formats.summary.visitList.rows[1].visitTime, '10:18')
  assert.equal(vm.formats.summary.visitList.rows[1].status, 'Visitado')
  assert.equal(vm.formats.summary.visitList.rows[1].saleStatus, 'Venta')

  const html = buildRouteFormatHtml(vm, 'summary')

  assert.match(html, /Lista de visitas/)
  assert.match(html, /Cliente Planeado/)
  assert.match(html, /Sin visita/)
  assert.match(html, /Cliente Visitado/)
  assert.match(html, /10:18/)
  assert.match(html, /Venta/)
  assert.match(html, /No venta/)
})

test('summary html removes recargas column from inventario y corte and shows kilos cash credit metrics', () => {
  const vm = buildRouteFormatsViewModel({
    ...CLOSED_DETAIL,
    sales: [
      {
        folio: 'S001',
        customer_name: 'Cliente A',
        payment_method: 'cash',
        amount_total: 100,
        kg_total: 11,
      },
    ],
    route_stops: [
      { id: 1, sequence: 10, customer_name: 'PONLE CAFE MORELOS', actual_start_time: '2026-05-27 21:13:00', has_sale: false, state: 'done' },
    ],
  })

  const html = buildRouteFormatHtml(vm, 'summary')

  assert.match(html, /Kilos vendidos/)
  assert.match(html, /Credito/)
  assert.match(html, /Cash \/ efectivo/)
  assert.match(html, /Diferencia/)
  assert.doesNotMatch(html, /Diferencia cash/)
  assert.doesNotMatch(html, /Diferencia efectivo/)
  assert.doesNotMatch(html, /<th>Recargas<\/th>/)
})

test('summary keeps single difference at zero when sales match credit plus cash', () => {
  const vm = buildRouteFormatsViewModel({
    ...CLOSED_DETAIL,
    cash_received_amount: null,
    summary: {
      by_method: { cash: 5589, credit: 0 },
      payments: { cash: { total: 0 }, credit: { total: 0 } },
      expected_payments: { cash: { total: 5589 }, credit: { total: 0 }, transfer: { total: 0 } },
      total_expected: 5589,
      total_collected: 5589,
    },
    sales: [
      {
        folio: 'S003',
        customer_name: 'Cliente contado',
        payment_method: 'cash',
        amount_total: 5589,
        kg_total: 15,
      },
    ],
  })

  assert.equal(vm.formats.summary.sales.total, 5589)
  assert.equal(vm.formats.liquidation.totals.credit, 0)
  assert.equal(vm.formats.liquidation.totals.cashExpected, 5589)
  assert.equal(vm.formats.liquidation.totals.cashReceived, 5589)
  assert.equal(vm.formats.liquidation.totals.difference, 0)
})

test('summary difference is zero when total sales minus credit equals cash', () => {
  const vm = buildRouteFormatsViewModel({
    ...CLOSED_DETAIL,
    cash_received_amount: 0,
    summary: {
      by_method: { cash: 2264, credit: 4339 },
      payments: { cash: { total: 0 }, credit: { total: 0 } },
      expected_payments: { cash: { total: 2264 }, credit: { total: 4339 }, transfer: { total: 0 } },
      total_expected: 6603,
      total_collected: 6603,
    },
    sales: [
      {
        folio: 'S004',
        customer_name: 'Cliente mixto',
        payment_method: 'cash',
        amount_total: 6603,
        kg_total: 20,
      },
    ],
  })

  assert.equal(vm.formats.summary.sales.total, 6603)
  assert.equal(vm.formats.liquidation.totals.credit, 4339)
  assert.equal(vm.formats.liquidation.totals.cashExpected, 2264)
  assert.equal(vm.formats.liquidation.totals.difference, 0)
})
