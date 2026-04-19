import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_EXPECTED_FREEZE_MIN,
  buildCycleExpectedTiming,
  minutesFromMachineDefrost,
  minutesFromMachineFreeze,
  minutesFromFreezeHours,
  withExpectedTimingFields,
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

test('buildCycleExpectedTiming prefers machine expected minute fields and includes defrost when supported', () => {
  assert.deepEqual(
    buildCycleExpectedTiming(
      { expected_freeze_min: 1, expected_defrost_min: 1, freeze_hours: 24 },
      true,
      true,
    ),
    {
      expected_freeze_min: 1,
      expected_defrost_min: 1,
    },
  )
})

test('machine timing helpers prefer explicit machine minute settings', () => {
  assert.equal(minutesFromMachineFreeze({ expected_freeze_min: 1, freeze_hours: 24 }), 1)
  assert.equal(minutesFromMachineDefrost({ expected_defrost_min: 2 }), 2)
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

test('withExpectedTimingFields appends freeze and defrost timing fields once', () => {
  assert.deepEqual(
    withExpectedTimingFields(['id', 'state'], true, true),
    ['id', 'state', 'expected_freeze_min', 'expected_defrost_min'],
  )
  assert.deepEqual(
    withExpectedTimingFields(['id', 'expected_freeze_min', 'expected_defrost_min'], true, true),
    ['id', 'expected_freeze_min', 'expected_defrost_min'],
  )
})
