import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_EXPECTED_FREEZE_MIN,
  buildCycleExpectedTiming,
  minutesFromFreezeHours,
  withExpectedFreezeField,
} from '../src/modules/produccion/cycleTiming.js'

test('minutesFromFreezeHours converts machine freeze hours to rounded minutes', () => {
  assert.equal(minutesFromFreezeHours(0.5), 30)
  assert.equal(minutesFromFreezeHours('0.75'), 45)
})

test('minutesFromFreezeHours falls back when machine config is invalid', () => {
  assert.equal(minutesFromFreezeHours(null), DEFAULT_EXPECTED_FREEZE_MIN)
  assert.equal(minutesFromFreezeHours(0), DEFAULT_EXPECTED_FREEZE_MIN)
  assert.equal(minutesFromFreezeHours('abc'), DEFAULT_EXPECTED_FREEZE_MIN)
})

test('buildCycleExpectedTiming persists expected freeze minutes only when field is supported', () => {
  assert.deepEqual(buildCycleExpectedTiming({ freeze_hours: 0.5 }, false), {})
  assert.deepEqual(buildCycleExpectedTiming({ freeze_hours: 0.5 }, true), {
    expected_freeze_min: 30,
  })
})

test('withExpectedFreezeField appends the cycle timing field once', () => {
  assert.deepEqual(
    withExpectedFreezeField(['id', 'state'], false),
    ['id', 'state'],
  )
  assert.deepEqual(
    withExpectedFreezeField(['id', 'state'], true),
    ['id', 'state', 'expected_freeze_min'],
  )
  assert.deepEqual(
    withExpectedFreezeField(['id', 'expected_freeze_min'], true),
    ['id', 'expected_freeze_min'],
  )
})
