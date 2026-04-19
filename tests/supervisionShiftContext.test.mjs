import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_SUPERVISION_WAREHOUSE_ID,
  resolveSupervisionWarehouseId,
} from '../src/modules/supervision/shiftContext.js'

test('resolveSupervisionWarehouseId uses explicit warehouse override first', () => {
  assert.equal(
    resolveSupervisionWarehouseId({ warehouse_id: 99 }, 78),
    78,
  )
})

test('resolveSupervisionWarehouseId falls back to session warehouse when present', () => {
  assert.equal(
    resolveSupervisionWarehouseId({ warehouse_id: 91 }),
    91,
  )
})

test('resolveSupervisionWarehouseId falls back to the Iguala plant when session has no warehouse', () => {
  assert.equal(
    resolveSupervisionWarehouseId({ role: 'supervisor_produccion' }),
    DEFAULT_SUPERVISION_WAREHOUSE_ID,
  )
})

test('resolveSupervisionWarehouseId ignores invalid values', () => {
  assert.equal(
    resolveSupervisionWarehouseId({ warehouse_id: 'abc' }, 0),
    DEFAULT_SUPERVISION_WAREHOUSE_ID,
  )
})
