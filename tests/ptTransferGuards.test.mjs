import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPtTransferActionId,
  getPtTransferActionTarget,
  isOdooPickingId,
  isPtTransferActionId,
  normalizeOdooPickingId,
  normalizePtTransferActionId,
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

test('isPtTransferActionId accepts both real pickings and pending PTT ids', () => {
  assert.equal(isPtTransferActionId(34), true)
  assert.equal(isPtTransferActionId('34'), true)
  assert.equal(isPtTransferActionId(-34), true)
  assert.equal(isPtTransferActionId('-34'), true)
  assert.equal(isPtTransferActionId(0), false)
  assert.equal(isPtTransferActionId('abc'), false)
})

test('normalizePtTransferActionId keeps signed integer ids and rejects zero/invalid values', () => {
  assert.equal(normalizePtTransferActionId(34), 34)
  assert.equal(normalizePtTransferActionId('34'), 34)
  assert.equal(normalizePtTransferActionId(-34), -34)
  assert.equal(normalizePtTransferActionId('-34'), -34)
  assert.equal(normalizePtTransferActionId(0), null)
  assert.equal(normalizePtTransferActionId(null), null)
})

test('getPtTransferActionId returns signed action ids for pending PTT transfers', () => {
  assert.equal(getPtTransferActionId({
    id: -36,
    picking_id: -36,
    transfer_id: 36,
    name: 'PTT/00036',
  }), -36)
})

test('getPtTransferActionTarget keeps the signed action id and real picking fallback separate', () => {
  assert.deepEqual(getPtTransferActionTarget({
    id: -36,
    picking_id: -36,
    transfer_id: 36,
    name: 'PTT/00036',
  }), {
    action_id: -36,
    picking_id: null,
    picking_name: '',
  })
})
