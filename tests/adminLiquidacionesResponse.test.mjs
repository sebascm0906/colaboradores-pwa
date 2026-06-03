import test from 'node:test'
import assert from 'node:assert/strict'

import * as liquidaciones from '../src/modules/admin/liquidacionesResponse.js'

const { normalizeLiquidationListResponse } = liquidaciones

test('liquidation list response surfaces forbidden envelopes instead of empty rows', () => {
  assert.throws(
    () => normalizeLiquidationListResponse({
      ok: false,
      message: 'Usuario sin permisos para esta operacion.',
      data: { code: 'forbidden' },
    }),
    /Usuario sin permisos/,
  )
})

test('liquidation list response accepts plans inside data envelope', () => {
  assert.deepEqual(
    normalizeLiquidationListResponse({
      ok: true,
      data: {
        plans: [{ id: 17, name: 'R-17' }],
      },
    }),
    [{ id: 17, name: 'R-17' }],
  )
})

test('liquidation history default date range starts and ends today', () => {
  assert.deepEqual(
    liquidaciones.getDefaultLiquidationHistoryDateRange(new Date('2026-06-03T18:30:00-06:00')),
    {
      dateFrom: '2026-06-03',
      dateTo: '2026-06-03',
    },
  )
})
