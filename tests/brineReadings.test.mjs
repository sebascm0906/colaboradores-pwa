import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getBrineReadingStatus,
  validateBrineReadingInput,
  buildBrineReadingPayload,
  getInitialBrineReadingForm,
} from '../src/modules/supervision/brineReadings.js'

test('getBrineReadingStatus marks tank as missing when it has no salt reading', () => {
  const status = getBrineReadingStatus({
    salt_level: 0,
    salt_level_updated_at: null,
    min_salt_level_for_harvest: 65,
  }, '2026-04-19')

  assert.equal(status.kind, 'missing')
  assert.equal(status.label, 'Sin lectura')
})

test('getBrineReadingStatus marks tank as stale when reading is not from today', () => {
  const status = getBrineReadingStatus({
    salt_level: 72,
    salt_level_updated_at: '2026-04-18 08:00:00',
    min_salt_level_for_harvest: 65,
  }, '2026-04-19')

  assert.equal(status.kind, 'stale')
})

test('getBrineReadingStatus marks tank as low when reading is below threshold today', () => {
  const status = getBrineReadingStatus({
    salt_level: 60,
    salt_level_updated_at: '2026-04-19 07:10:00',
    min_salt_level_for_harvest: 65,
  }, '2026-04-19')

  assert.equal(status.kind, 'low')
})

test('validateBrineReadingInput requires a positive numeric salt level', () => {
  assert.deepEqual(validateBrineReadingInput({ saltLevel: '' }), { saltLevel: 'Captura el nivel de sal' })
  assert.deepEqual(validateBrineReadingInput({ saltLevel: '-1' }), { saltLevel: 'Ingresa un valor valido' })
  assert.deepEqual(validateBrineReadingInput({ saltLevel: '68.5', brineTemp: '' }), {})
})

test('buildBrineReadingPayload normalizes machine id and numeric values', () => {
  assert.deepEqual(buildBrineReadingPayload({
    machineId: '14',
    saltLevel: '68.5',
    brineTemp: '-7.2',
  }), {
    machine_id: 14,
    salt_level: 68.5,
    brine_temp: -7.2,
  })
})

test('buildBrineReadingPayload omits brine_temp when supervisor leaves it empty', () => {
  assert.deepEqual(buildBrineReadingPayload({
    machineId: 8,
    saltLevel: '70',
    brineTemp: '',
  }), {
    machine_id: 8,
    salt_level: 70,
  })
})

test('getInitialBrineReadingForm preloads current tank values as strings', () => {
  assert.deepEqual(getInitialBrineReadingForm({
    id: 9,
    salt_level: 67.2,
    brine_temp: -6.5,
  }), {
    machineId: 9,
    saltLevel: '67.2',
    brineTemp: '-6.5',
  })
})

test('getBrineReadingStatus marks tank as ok when reading is from today and above threshold', () => {
  const status = getBrineReadingStatus({
    salt_level: 68,
    salt_level_updated_at: '2026-04-19 06:45:00',
    min_salt_level_for_harvest: 65,
  }, '2026-04-19')

  assert.equal(status.kind, 'ok')
  assert.equal(status.label, 'Al dia')
})
