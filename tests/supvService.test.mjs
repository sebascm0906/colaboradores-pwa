import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildLiquidatedPlanIdSet,
  fmtTime,
} from '../src/modules/supervisor-ventas/supvService.js'

test('fmtTime handles non-string values without throwing', () => {
  assert.equal(fmtTime(9.5), '9.5')
  assert.equal(fmtTime(false), '--')
})

test('buildLiquidatedPlanIdSet marks plans as liquidated from pending and validated admin lists', () => {
  const liquidatedPlanIds = buildLiquidatedPlanIdSet(
    [
      { id: 320, name: 'RPLAN/2026/00320' },
      { plan_id: 321, name: 'RPLAN/2026/00321' },
    ],
    [
      { id: 322, name: 'RPLAN/2026/00322' },
      { plan_id: 323, name: 'RPLAN/2026/00323' },
    ],
  )

  assert.equal(liquidatedPlanIds.has(320), true)
  assert.equal(liquidatedPlanIds.has(321), true)
  assert.equal(liquidatedPlanIds.has(322), true)
  assert.equal(liquidatedPlanIds.has(323), true)
  assert.equal(liquidatedPlanIds.has(999), false)
})
