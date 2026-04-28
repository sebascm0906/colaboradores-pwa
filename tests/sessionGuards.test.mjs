import test from 'node:test'
import assert from 'node:assert/strict'

import { requireWarehouse, softWarehouse } from '../src/lib/sessionGuards.js'

test('softWarehouse returns warehouse_id when present', () => {
  assert.equal(softWarehouse({ warehouse_id: 89, plant_warehouse_id: 76, default_source_warehouse_id: 55 }), 89)
})

test('softWarehouse falls back to plant_warehouse_id', () => {
  assert.equal(softWarehouse({ plant_warehouse_id: 76 }), 76)
})

test('softWarehouse falls back to default_source_warehouse_id', () => {
  assert.equal(softWarehouse({ default_source_warehouse_id: 89 }), 89)
})

test('requireWarehouse accepts default_source_warehouse_id fallback', () => {
  assert.equal(requireWarehouse({ default_source_warehouse_id: 89 }), 89)
})
