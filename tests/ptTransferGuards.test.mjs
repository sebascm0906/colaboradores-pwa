import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPtTransferActionId,
  getPtTransferActionTarget,
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

test('getPtTransferActionId does not use transfer_id as stock picking id', () => {
  assert.equal(getPtTransferActionId({
    id: -36,
    picking_id: -36,
    transfer_id: 36,
    name: 'PTT/00036',
  }), null)
})

test('getPtTransferActionTarget falls back to picking name for temporary negative ids', () => {
  assert.deepEqual(getPtTransferActionTarget({
    id: -36,
    picking_id: -36,
    transfer_id: 36,
    name: 'PTT/00036',
  }), {
    picking_id: null,
    picking_name: 'PTT/00036',
  })
})
