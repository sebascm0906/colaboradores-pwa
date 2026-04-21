import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getShiftStartReadiness,
  hasStartEnergyReading,
} from '../src/modules/supervision/shiftStartReadiness.js'

test('hasStartEnergyReading returns true only when start reading has positive kwh', () => {
  assert.equal(hasStartEnergyReading([]), false)
  assert.equal(hasStartEnergyReading([{ reading_type: 'end', kwh_value: 100 }]), false)
  assert.equal(hasStartEnergyReading([{ reading_type: 'start', kwh_value: 0 }]), false)
  assert.equal(hasStartEnergyReading([{ reading_type: 'start', kwh_value: 120 }]), true)
})

test('getShiftStartReadiness blocks start when energy reading is missing', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [],
    tanks: [{ id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 }],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
  assert.equal(readiness.energyReady, false)
  assert.equal(readiness.blockers.includes('Falta lectura inicial de energia'), true)
})

test('getShiftStartReadiness blocks start when any active tank lacks a valid reading', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [
      { id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 },
      { id: 2, salt_level: 0, salt_level_updated_at: null, min_salt_level_for_harvest: 65 },
    ],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
  assert.equal(readiness.tankReadiness[1].ready, false)
})

test('getShiftStartReadiness allows start when draft shift has energy and all tanks ready', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [
      { id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 },
      { id: 2, salt_level: 68, salt_level_updated_at: '2026-04-20 06:30:00', min_salt_level_for_harvest: 65 },
    ],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, true)
  assert.equal(readiness.blockers.length, 0)
})

test('getShiftStartReadiness does not allow start when shift is already in progress', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'in_progress' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [{ id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 }],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
})

test('getShiftStartReadiness treats an empty active tank list as blocked', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
  assert.equal(readiness.blockers.includes('No hay tanques activos disponibles para validar salmuera'), true)
})
