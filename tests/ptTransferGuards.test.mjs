import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPtTransferActionId,
  isOdooPickingId,
  normalizeOdooPickingId,
} from '../src/modules/entregas/ptTransferGuards.js'

test('isOdooPickingId only accepts positive integer ids', () => {
  assert.equal(isOdooPickingId(34), true)
  assert.equal(isOdooPickingId('34'), true)
  assert.equal(isOdooPickingId(-34), false)
  assert.equal(isOdooPickingId(0), false)
  assert.equal(isOdooPickingId('abc'), false)
})

test('normalizeOdooPickingId returns null for local or invalid ids', () => {
  assert.equal(normalizeOdooPickingId(34), 34)
  assert.equal(normalizeOdooPickingId('34'), 34)
  assert.equal(normalizeOdooPickingId(-34), null)
  assert.equal(normalizeOdooPickingId(0), null)
  assert.equal(normalizeOdooPickingId(null), null)
})

test('getPtTransferActionId uses transfer_id when pending payload has temporary negative ids', () => {
  assert.equal(getPtTransferActionId({
    id: -36,
    picking_id: -36,
    transfer_id: 36,
    name: 'PTT/00036',
  }), 36)
})
